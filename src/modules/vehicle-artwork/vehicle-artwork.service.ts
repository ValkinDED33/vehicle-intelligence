import { ConflictException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { and, eq, gte, lt, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { DatabaseService } from "../../common/database/database.service";
import { GarageService } from "../garage/services/garage.service";
import { VehicleProfileService } from "../vehicle-profile/services/vehicle-profile.service";
import { VinService } from "../vin/services/vin.service";
import { artworkFacts, artworkFraming, type ArtworkFacts } from "./artwork-facts";
import { ArtworkProviderError, OpenAiArtworkProvider } from "./openai-artwork.provider";
import { artworkBudgets, vehicleArtworks } from "./schemas/vehicle-artwork.schema";

export type ArtworkState = "disabled" | "missing_details" | "available" | "generating" | "ready" | "failed" | "uncertain" | "limit";
export interface ArtworkResponse {
  vehicleId: string; state: ArtworkState; fingerprint: string | null; missing: string[];
  imageDataUrl?: string; facts?: ArtworkFacts;
  framing?: ReturnType<typeof artworkFraming>;
}
const LEASE_MS = 5 * 60_000;

@Injectable()
export class VehicleArtworkService {
  constructor(private readonly db: DatabaseService, private readonly garage: GarageService,
    private readonly profiles: VehicleProfileService, private readonly vin: VinService,
    private readonly provider: OpenAiArtworkProvider, private readonly config: ConfigService) {}

  private get enabled() { return this.config.get("VEHICLE_ARTWORK_ENABLED") === "true" && this.provider.configured; }
  private limit(name: string, max: number) { const n = Number(this.config.get(name)); return Number.isInteger(n) && n > 0 && n <= max ? n : 0; }
  private async context(ownerId: string, vehicleId: string) {
    const vehicle = await this.garage.getVehicle(ownerId, vehicleId);
    const [profile, decode] = await Promise.all([this.profiles.getCurrentProfile(ownerId, vehicleId), this.vin.getLatestDecode(ownerId, vehicleId)]);
    return { ...artworkFacts(vehicle, profile, decode), archived: vehicle.isArchived };
  }
  private rowState(row: typeof vehicleArtworks.$inferSelect): ArtworkState {
    return row.state === "generating" && row.createdAt.getTime() < Date.now() - LEASE_MS ? "uncertain" : row.state as ArtworkState;
  }
  private response(vehicleId: string, ctx: Awaited<ReturnType<VehicleArtworkService["context"]>>, state: ArtworkState, row?: typeof vehicleArtworks.$inferSelect): ArtworkResponse {
    return { vehicleId, state, fingerprint: ctx.fingerprint, missing: ctx.missing,
      ...(state === "ready" && row?.imageBase64 ? { imageDataUrl: `data:image/webp;base64,${row.imageBase64}`, facts: ctx.facts, framing: artworkFraming(ctx.facts) } : {}) };
  }
  async current(ownerId: string, vehicleId: string): Promise<ArtworkResponse> {
    const ctx = await this.context(ownerId, vehicleId);
    if (ctx.missing.length) return this.response(vehicleId, ctx, "missing_details");
    if (!this.enabled || ctx.archived) return this.response(vehicleId, ctx, "disabled");
    const [row] = await this.db.connection.select().from(vehicleArtworks).where(and(eq(vehicleArtworks.ownerId, ownerId), eq(vehicleArtworks.vehicleId, vehicleId), eq(vehicleArtworks.fingerprint, ctx.fingerprint!)));
    return this.response(vehicleId, ctx, row ? this.rowState(row) : this.limit("VEHICLE_ARTWORK_DAILY_LIMIT", 100) && this.limit("VEHICLE_ARTWORK_OWNER_DAILY_LIMIT", 5) ? "available" : "disabled", row);
  }
  async ensure(ownerId: string, vehicleId: string, fingerprint: string): Promise<ArtworkResponse> {
    const ctx = await this.context(ownerId, vehicleId);
    if (ctx.missing.length) return this.response(vehicleId, ctx, "missing_details");
    if (ctx.fingerprint !== fingerprint) throw new ConflictException({ code: "ARTWORK_FACTS_CHANGED", message: "Vehicle facts changed" });
    if (!this.enabled || ctx.archived) return this.response(vehicleId, ctx, "disabled");
    const daily = this.limit("VEHICLE_ARTWORK_DAILY_LIMIT", 100), perOwner = this.limit("VEHICLE_ARTWORK_OWNER_DAILY_LIMIT", 5);
    if (!daily || !perOwner) return this.response(vehicleId, ctx, "disabled");
    const reference = await this.provider.reference(ctx.facts);
    const now = new Date(), day = now.toISOString().slice(0, 10), start = new Date(day + "T00:00:00Z"), end = new Date(start.getTime() + 86400_000);
    const token = randomUUID();
    const reserved = await this.db.connection.transaction(async tx => {
      await tx.insert(artworkBudgets).values({ day }).onConflictDoNothing();
      // One global daily lock serializes spend reservations across instances and owners.
      const [budget] = await tx.select().from(artworkBudgets).where(eq(artworkBudgets.day, day)).for("update");
      const [existing] = await tx.select().from(vehicleArtworks).where(and(eq(vehicleArtworks.ownerId, ownerId), eq(vehicleArtworks.vehicleId, vehicleId), eq(vehicleArtworks.fingerprint, fingerprint)));
      if (existing) return { row: existing, started: false, limited: false };
      const [ownerCount] = await tx.select({ n: sql<number>`cast(count(*) as integer)` }).from(vehicleArtworks).where(and(eq(vehicleArtworks.ownerId, ownerId), gte(vehicleArtworks.createdAt, start), lt(vehicleArtworks.createdAt, end)));
      const [carCount] = await tx.select({ n: sql<number>`cast(count(*) as integer)` }).from(vehicleArtworks).where(and(eq(vehicleArtworks.ownerId, ownerId), eq(vehicleArtworks.vehicleId, vehicleId)));
      if (budget.used >= daily || ownerCount.n >= perOwner || carCount.n >= 5) return { row: undefined, started: false, limited: true };
      const [row] = await tx.insert(vehicleArtworks).values({ ownerId, vehicleId, fingerprint, facts: ctx.facts, state: "generating", token, createdAt: now }).returning();
      await tx.update(artworkBudgets).set({ used: budget.used + 1 }).where(eq(artworkBudgets.day, day));
      return { row, started: true, limited: false };
    });
    if (!reserved.started) return this.response(vehicleId, ctx, reserved.limited ? "limit" : this.rowState(reserved.row!), reserved.row);
    try {
      // Check again after reservation; archived/changed cars never reach the provider.
      const latest = await this.context(ownerId, vehicleId);
      if (!this.enabled || latest.archived || latest.fingerprint !== fingerprint) {
        await this.finish(ownerId, vehicleId, token, "failed", null, "facts_changed");
      } else {
        const image = await this.provider.generate(ctx.facts, ownerId, reference);
        await this.finish(ownerId, vehicleId, token, "ready", image, null);
      }
    } catch (error) {
      const safe = error instanceof ArtworkProviderError ? error : new ArtworkProviderError("generation_uncertain", true);
      await this.finish(ownerId, vehicleId, token, safe.uncertain ? "uncertain" : "failed", null, safe.code);
    }
    // Re-resolve facts: an old in-flight result may be saved, but is never shown as current.
    return this.current(ownerId, vehicleId);
  }
  private async finish(ownerId: string, vehicleId: string, token: string, state: string, imageBase64: string | null, errorCode: string | null) {
    await this.db.connection.update(vehicleArtworks).set({ state, imageBase64, errorCode }).where(and(eq(vehicleArtworks.ownerId, ownerId), eq(vehicleArtworks.vehicleId, vehicleId), eq(vehicleArtworks.token, token)));
  }
}
