import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { isUUID } from "class-validator";
import { and, asc, desc, eq, ilike, sql } from "drizzle-orm";
import { DatabaseService } from "../../common/database/database.service";
import { vehicles } from "../garage/schemas/vehicle.schema";
import { users } from "../identity/schemas/user.schema";
import { SupportAccessService } from "./support-access.service";
import { AdminSupportTicketQueryDto, CreateSupportTicketDto, SupportMessageDto, SupportStatusDto, SupportTicketQueryDto, supportInput } from "./support.dto";
import { SupportNotificationWorker } from "./support-notifications.service";
import { supportMessages, supportNotificationOutbox, supportTickets, type SupportTicket, type SupportTicketDetail, type SupportTicketView } from "./schemas/support.schema";

type Transaction = Parameters<Parameters<DatabaseService["connection"]["transaction"]>[0]>[0];

@Injectable()
export class SupportService {
  constructor(private readonly db: DatabaseService, private readonly access: SupportAccessService,
    private readonly notifications: SupportNotificationWorker) {}

  async create(userId: string, input: CreateSupportTicketDto): Promise<SupportTicketDetail> {
    this.access.assertUser(userId);
    const data = supportInput(CreateSupportTicketDto, input);
    const detail = await this.db.connection.transaction(async tx => {
      if (data.vehicleId) {
        const [vehicle] = await tx.select({ id: vehicles.id }).from(vehicles)
          .where(and(eq(vehicles.id, data.vehicleId), eq(vehicles.ownerId, userId))).for("share");
        if (!vehicle) throw new NotFoundException("Vehicle not found");
      }
      const now = new Date();
      const [ticket] = await tx.insert(supportTickets).values({
        ownerId: userId, subject: data.subject, category: data.category, vehicleId: data.vehicleId ?? null,
        createdAt: now, updatedAt: now,
      }).returning();
      const [message] = await tx.insert(supportMessages).values({
        ticketId: ticket.id, authorId: userId, authorRole: "user", body: data.message, createdAt: now,
      }).returning({ id: supportMessages.id });
      await tx.insert(supportNotificationOutbox).values({ ticketId: ticket.id, messageId: message.id, event: "new_ticket", createdAt: now, nextAttemptAt: now });
      return this.detail(tx, ticket, false);
    });
    this.notifications.wake();
    return detail;
  }

  async list(userId: string, query: SupportTicketQueryDto = new SupportTicketQueryDto()) {
    this.access.assertUser(userId);
    return this.listTickets(supportInput(SupportTicketQueryDto, query), userId, false);
  }

  async get(userId: string, id: string): Promise<SupportTicketDetail> {
    this.access.assertUser(userId);
    return this.db.connection.transaction(async tx => this.detail(tx, await this.ticket(tx, id, userId, "share"), false));
  }

  async reply(userId: string, id: string, input: SupportMessageDto): Promise<SupportTicketDetail> {
    this.access.assertUser(userId);
    const data = supportInput(SupportMessageDto, input);
    const detail = await this.addMessage(userId, id, data.message, false);
    this.notifications.wake();
    return detail;
  }

  async adminList(userId: string, query: AdminSupportTicketQueryDto = new AdminSupportTicketQueryDto()) {
    this.access.assertAdmin(userId);
    const data = supportInput(AdminSupportTicketQueryDto, query);
    return this.listTickets(data, data.ownerId, true);
  }

  async adminGet(userId: string, id: string): Promise<SupportTicketDetail> {
    this.access.assertAdmin(userId);
    return this.db.connection.transaction(async tx => this.detail(tx, await this.ticket(tx, id, undefined, "share"), true));
  }

  async adminReply(userId: string, id: string, input: SupportMessageDto): Promise<SupportTicketDetail> {
    this.access.assertAdmin(userId);
    const data = supportInput(SupportMessageDto, input);
    return this.addMessage(userId, id, data.message, true);
  }

  async adminStatus(userId: string, id: string, input: SupportStatusDto): Promise<SupportTicketDetail> {
    this.access.assertAdmin(userId);
    const data = supportInput(SupportStatusDto, input);
    return this.db.connection.transaction(async tx => {
      const ticket = await this.ticket(tx, id);
      const [updated] = await tx.update(supportTickets).set({ status: data.status, updatedAt: this.nextTime(ticket) })
        .where(eq(supportTickets.id, ticket.id)).returning();
      return this.detail(tx, updated, true);
    });
  }

  private async listTickets(query: SupportTicketQueryDto, ownerId: string | undefined, admin: boolean) {
    const { page, pageSize } = query;
    const search = query.q?.replace(/[\\%_]/g, "\\$&");
    const where = and(ownerId ? eq(supportTickets.ownerId, ownerId) : undefined,
      query.status ? eq(supportTickets.status, query.status) : undefined,
      query.category ? eq(supportTickets.category, query.category) : undefined,
      search ? ilike(supportTickets.subject, `%${search}%`) : undefined);
    return this.db.connection.transaction(async tx => {
      const [{ total }] = await tx.select({ total: sql<number>`count(*)::integer` }).from(supportTickets).where(where);
      const rows = await tx.select({ ticket: supportTickets,
        owner: { id: users.id, email: users.email, displayName: users.displayName },
      }).from(supportTickets).innerJoin(users, eq(users.id, supportTickets.ownerId)).where(where)
        .orderBy(desc(supportTickets.updatedAt), desc(supportTickets.id)).limit(pageSize).offset((page - 1) * pageSize);
      const tickets: SupportTicketView[] = rows.map(row => {
        const { ownerId: _ownerId, ...ticket } = row.ticket;
        return admin ? { ...ticket, owner: row.owner } : ticket;
      });
      return { tickets, total, page, pageSize };
    }, { isolationLevel: "repeatable read" });
  }

  private async ticket(tx: Transaction, id: string, ownerId?: string, lock: "share" | "update" = "update") {
    if (typeof id !== "string" || !isUUID(id)) throw new BadRequestException("Invalid ticket ID");
    const [ticket] = await tx.select().from(supportTickets)
      .where(and(eq(supportTickets.id, id), ownerId ? eq(supportTickets.ownerId, ownerId) : undefined)).for(lock);
    if (!ticket) throw new NotFoundException("Support ticket not found");
    return ticket;
  }

  private nextTime(ticket: SupportTicket): Date {
    return new Date(Math.max(Date.now(), ticket.updatedAt.getTime() + 1));
  }

  private async addMessage(userId: string, id: string, body: string, admin: boolean): Promise<SupportTicketDetail> {
    return this.db.connection.transaction(async tx => {
      // Serialize status changes and replies so a user reply reopens a resolved ticket.
      const ticket = await this.ticket(tx, id, admin ? undefined : userId);
      const now = this.nextTime(ticket);
      const [message] = await tx.insert(supportMessages).values({
        ticketId: ticket.id, authorId: userId, authorRole: admin ? "admin" : "user", body, createdAt: now,
      }).returning({ id: supportMessages.id });
      const status = admin ? ticket.status === "open" ? "in_progress" : ticket.status
        : ticket.status === "resolved" ? "open" : ticket.status;
      const [updated] = await tx.update(supportTickets).set({ status, updatedAt: now }).where(eq(supportTickets.id, ticket.id)).returning();
      if (!admin) await tx.insert(supportNotificationOutbox).values({ ticketId: ticket.id, messageId: message.id, event: "new_reply", createdAt: now, nextAttemptAt: now });
      return this.detail(tx, updated, admin);
    });
  }

  private async detail(tx: Transaction, ticket: SupportTicket, admin: boolean): Promise<SupportTicketDetail> {
    const messages = await tx.select({ id: supportMessages.id, body: supportMessages.body,
      authorRole: supportMessages.authorRole, createdAt: supportMessages.createdAt })
      .from(supportMessages).where(eq(supportMessages.ticketId, ticket.id))
      .orderBy(asc(supportMessages.createdAt), asc(supportMessages.id));
    const { ownerId, ...view } = ticket;
    if (!admin) return { ticket: view, messages };
    const [owner] = await tx.select({ id: users.id, email: users.email, displayName: users.displayName }).from(users).where(eq(users.id, ownerId));
    const [delivery] = await tx.select({ status: supportNotificationOutbox.status, attempts: supportNotificationOutbox.attempts,
      lastError: supportNotificationOutbox.lastError, nextAttemptAt: supportNotificationOutbox.nextAttemptAt })
      .from(supportNotificationOutbox).where(eq(supportNotificationOutbox.ticketId, ticket.id))
      .orderBy(desc(supportNotificationOutbox.createdAt), desc(supportNotificationOutbox.id)).limit(1);
    const notification = delivery ? { ...delivery, nextAttemptAt: delivery.status === "pending" ? delivery.nextAttemptAt : null } : null;
    return { ticket: { ...view, owner, notification }, messages };
  }
}
