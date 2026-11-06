import { BadRequestException, ConflictException, HttpException, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { DatabaseService } from "../../common/database/database.service";
import { VehicleDatabasesNoRecordsError } from "../../common/vehicle-databases/vehicle-databases-client.service";
import { users } from "../identity/schemas/user.schema";
import { vinAccess } from "./schemas/vin-access.schema";

export type VinAccessState = "available" | "in_progress" | "used" | "uncertain";
export interface VinAccessStatus {
  state: VinAccessState;
  freeRemaining: 0 | 1;
  paidEnabled: false;
}
const LEASE_MS = 10 * 60 * 1000;
const RELEASE_CODES = new Set(["VIN_PROVIDER_NOT_CONFIGURED", "VINCARIO_NOT_CONFIGURED", "VIN_PROVIDER_AUTH_FAILED", "VIN_PROVIDER_QUOTA_EXHAUSTED", "VIN_PROVIDER_RATE_LIMITED"]);

@Injectable()
export class VinAccessService {
  constructor(private readonly database: DatabaseService) {}

  private state(row?: typeof vinAccess.$inferSelect): VinAccessState {
    if (!row) return "available";
    if (row.state === "in_progress" && (!row.claimedAt || row.claimedAt.getTime() < Date.now() - LEASE_MS)) return "uncertain";
    return row.state as VinAccessState;
  }

  async status(ownerId: string): Promise<VinAccessStatus> {
    const [row] = await this.database.connection.select().from(vinAccess).where(eq(vinAccess.ownerId, ownerId));
    const state = this.state(row);
    return { state, freeRemaining: state === "available" ? 1 : 0, paidEnabled: false };
  }

  async ensureAvailable(ownerId: string): Promise<void> {
    const { state } = await this.status(ownerId);
    if (state !== "available") this.denied(state);
  }

  private denied(state: VinAccessState): never {
    if (state === "used") throw new HttpException({ code: "VIN_TRIAL_USED", message: "Безкоштовну VIN-перевірку вже використано. Повторні перевірки закрито до підключення оплати." }, 402);
    throw new ConflictException({ code: state === "in_progress" ? "VIN_CHECK_IN_PROGRESS" : "VIN_CHECK_UNCERTAIN", message: state === "in_progress" ? "VIN-перевірка вже триває. Дочекайтеся результату." : "Результат попереднього VIN-запиту не підтверджено. Повторний запит заблоковано, щоб уникнути подвійного списання. Зверніться до підтримки." });
  }

  async run<T>(ownerId: string, source: string, vin: string, operation: () => Promise<T>): Promise<T> {
    if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) throw new BadRequestException("VIN має містити 17 символів без літер I, O та Q.");
    const token = randomUUID();
    const state = await this.database.connection.transaction(async tx => {
      // Use the same user lock as Telegram linking, before touching the allowance.
      const [owner] = await tx.select({ id: users.id }).from(users).where(eq(users.id, ownerId)).for("update");
      if (!owner) throw new UnauthorizedException();
      await tx.insert(vinAccess).values({ ownerId }).onConflictDoNothing();
      const [row] = await tx.select().from(vinAccess).where(eq(vinAccess.ownerId, ownerId)).for("update");
      const current = this.state(row);
      if (current === "available") await tx.update(vinAccess).set({ state: "in_progress", claimToken: token, claimedAt: new Date(), source, vin }).where(eq(vinAccess.ownerId, ownerId));
      return current;
    });
    if (state !== "available") this.denied(state);

    let result: T;
    try {
      result = await operation();
    } catch (error) {
      const response = error instanceof HttpException ? error.getResponse() : null;
      const code = response && typeof response === "object" && "code" in response ? String(response.code) : "";
      const noData = error instanceof VehicleDatabasesNoRecordsError;
      // A timeout/crash is not proof that the provider did not process the request.
      await this.finish(ownerId, token, noData ? "used" : RELEASE_CODES.has(code) ? "available" : "uncertain");
      if (noData) throw new NotFoundException({ code: "VIN_NO_DATA", message: "За цим VIN джерело не має даних. Безкоштовну перевірку використано." });
      if (!RELEASE_CODES.has(code)) this.denied("uncertain");
      throw error;
    }
    await this.finish(ownerId, token, "used");
    return result;
  }

  private async finish(ownerId: string, token: string, state: VinAccessState) {
    await this.database.connection.update(vinAccess).set({ state, claimToken: null }).where(and(eq(vinAccess.ownerId, ownerId), eq(vinAccess.claimToken, token)));
  }
}
