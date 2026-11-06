import { ConflictException, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { and, eq, gt, isNull, lte, or, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { DatabaseService } from "../../common/database/database.service";
import { GarageService } from "../garage/services/garage.service";
import type { ConversationMessage } from "../telegram/telegram-conversation.types";
import { assistantMemories } from "./schemas/assistant-memory.schema";
import type { MemoryMessage, MemoryScope, MemorySnapshot, MemoryTurnResult } from "./assistant-memory.types";
import { assistantPreferences } from "./schemas/assistant-preferences.schema";
import { DEFAULT_ASSISTANT_PREFERENCES, type AssistantPreferencesSnapshot } from "./assistant-preferences";
import type { UpdateAssistantPreferencesDto } from "./dto/assistant-preferences.dto";

const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const LEASE_MS = 5 * 60 * 1000;
type Transaction = Parameters<Parameters<DatabaseService["connection"]["transaction"]>[0]>[0];
type MemoryRow = typeof assistantMemories.$inferSelect;

@Injectable()
export class AssistantMemoryService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AssistantMemoryService.name);
  private cleanupTimer?: ReturnType<typeof setInterval>;
  constructor(private readonly database: DatabaseService, private readonly garage: GarageService) {}

  onModuleInit() {
    const cleanup = () => { void this.purgeExpired().catch(() => this.logger.warn("Expired assistant history cleanup failed")); };
    cleanup();
    this.cleanupTimer = setInterval(cleanup, 60 * 60 * 1000);
    this.cleanupTimer.unref();
  }

  onModuleDestroy() { if (this.cleanupTimer) clearInterval(this.cleanupTimer); }

  async purgeExpired(): Promise<void> {
    const now = new Date();
    await this.database.connection.update(assistantMemories).set({
      messages: [], epoch: sql`${assistantMemories.epoch} + 1`, expiresAt: new Date(Date.now() + RETENTION_MS), lockToken: null, lockedUntil: null,
    }).where(and(lte(assistantMemories.expiresAt, now), or(isNull(assistantMemories.lockedUntil), lte(assistantMemories.lockedUntil, now))));
    const cutoff = new Date(Date.now() - RETENTION_MS).toISOString();
    await this.database.connection.execute(sql`UPDATE assistant_memories SET messages = coalesce(
      (SELECT jsonb_agg(item.value ORDER BY item.ordinality)
       FROM jsonb_array_elements(messages) WITH ORDINALITY AS item(value, ordinality)
       WHERE item.value->>'createdAt' >= ${cutoff}), '[]'::jsonb)
      WHERE messages->0->>'createdAt' < ${cutoff}`);
  }

  private liveMessages(messages: MemoryMessage[]): MemoryMessage[] {
    const cutoff = Date.now() - RETENTION_MS;
    return messages.filter(message => new Date(message.createdAt).getTime() >= cutoff);
  }

  private where(scope: MemoryScope) {
    return and(eq(assistantMemories.ownerId, scope.ownerId), eq(assistantMemories.scopeKey, this.scopeKey(scope)), eq(assistantMemories.language, scope.language));
  }

  private scopeKey(scope: MemoryScope) { return scope.vehicleId?.toLowerCase() ?? "general"; }

  private async authorize(scope: MemoryScope) {
    if (scope.vehicleId) await this.garage.getVehicle(scope.ownerId, scope.vehicleId);
  }

  private async lockedRow(tx: Transaction, scope: MemoryScope): Promise<MemoryRow> {
    await tx.insert(assistantMemories).values({
      ownerId: scope.ownerId, vehicleId: scope.vehicleId ?? null, scopeKey: this.scopeKey(scope),
      language: scope.language, expiresAt: new Date(Date.now() + RETENTION_MS),
    }).onConflictDoNothing();
    const [row] = await tx.select().from(assistantMemories).where(this.where(scope)).for("update");
    if (row.expiresAt.getTime() > Date.now()) {
      const messages = this.liveMessages(row.messages);
      if (messages.length === row.messages.length) return row;
      const [trimmed] = await tx.update(assistantMemories).set({ messages }).where(this.where(scope)).returning();
      return trimmed;
    }
    const [fresh] = await tx.update(assistantMemories).set({
      messages: [], epoch: row.epoch + 1, expiresAt: new Date(Date.now() + RETENTION_MS), lockToken: null, lockedUntil: null,
    }).where(this.where(scope)).returning();
    return fresh;
  }

  private snapshot(row: MemoryRow): MemorySnapshot {
    return { messages: row.messages, epoch: row.epoch, expiresAt: row.expiresAt };
  }

  async get(scope: MemoryScope): Promise<MemorySnapshot> {
    await this.authorize(scope);
    return this.database.connection.transaction(async tx => this.snapshot(await this.lockedRow(tx, scope)));
  }

  async clear(scope: MemoryScope): Promise<MemorySnapshot> {
    await this.authorize(scope);
    return this.database.connection.transaction(async tx => {
      const row = await this.lockedRow(tx, scope);
      const [cleared] = await tx.update(assistantMemories).set({
        messages: [], epoch: row.epoch + 1, expiresAt: new Date(Date.now() + RETENTION_MS), lockToken: null, lockedUntil: null,
      }).where(this.where(scope)).returning();
      return this.snapshot(cleared);
    });
  }

  async isCurrent(scope: MemoryScope, epoch: number): Promise<boolean> {
    return (await this.get(scope)).epoch === epoch;
  }

  async preferences(ownerId: string): Promise<AssistantPreferencesSnapshot> {
    const [row] = await this.database.connection.select().from(assistantPreferences).where(eq(assistantPreferences.ownerId, ownerId));
    return row ? this.preferenceValues(row) : { ...DEFAULT_ASSISTANT_PREFERENCES };
  }

  async setPreferences(ownerId: string, input: UpdateAssistantPreferencesDto): Promise<AssistantPreferencesSnapshot> {
    return this.database.connection.transaction(async tx => {
      await tx.insert(assistantPreferences).values({ ownerId }).onConflictDoNothing();
      const [row] = await tx.select().from(assistantPreferences).where(eq(assistantPreferences.ownerId, ownerId)).for("update");
      if (row.revision !== input.expectedRevision) throw new ConflictException("Налаштування помічника змінилися. Оновіть дані перед збереженням.");
      const [saved] = await tx.update(assistantPreferences).set({
        detailLevel: input.detailLevel, priority: input.priority, drivingPattern: input.drivingPattern, revision: row.revision + 1,
      }).where(eq(assistantPreferences.ownerId, ownerId)).returning();
      return this.preferenceValues(saved);
    });
  }

  private preferenceValues(row: typeof assistantPreferences.$inferSelect): AssistantPreferencesSnapshot {
    return { detailLevel: row.detailLevel, priority: row.priority, drivingPattern: row.drivingPattern, revision: row.revision };
  }

  private added(messages: ConversationMessage[], channel: MemoryMessage["channel"]): MemoryMessage[] {
    return messages.filter(message => message.content.trim()).map(message => ({
      id: randomUUID(), role: message.role, content: message.content.slice(0, 8000), channel, createdAt: new Date().toISOString(),
    }));
  }

  async record(scope: MemoryScope, epoch: number, messages: ConversationMessage[], channel: MemoryMessage["channel"]): Promise<void> {
    await this.authorize(scope);
    await this.database.connection.transaction(async tx => {
      const row = await this.lockedRow(tx, scope);
      if (row.epoch !== epoch) throw this.changed();
      await tx.update(assistantMemories).set({
        messages: [...row.messages, ...this.added(messages, channel)].slice(-24), expiresAt: new Date(Date.now() + RETENTION_MS),
      }).where(this.where(scope));
    });
  }

  async run<T>(scope: MemoryScope, channel: MemoryMessage["channel"], work: (snapshot: MemorySnapshot) => Promise<MemoryTurnResult<T>>, expectedEpoch?: number): Promise<T> {
    await this.authorize(scope);
    const token = randomUUID();
    const claimed = await this.database.connection.transaction(async tx => {
      const row = await this.lockedRow(tx, scope);
      if (expectedEpoch !== undefined && row.epoch !== expectedEpoch) throw this.changed();
      if (row.lockedUntil && row.lockedUntil.getTime() > Date.now()) {
        throw new ConflictException("Помічник уже обробляє запит у цьому чаті. Спробуйте ще раз за мить.");
      }
      await tx.update(assistantMemories).set({ lockToken: token, lockedUntil: new Date(Date.now() + LEASE_MS), expiresAt: new Date(Date.now() + RETENTION_MS) }).where(this.where(scope));
      return this.snapshot(row);
    });
    const ownsLease = and(this.where(scope), eq(assistantMemories.lockToken, token), eq(assistantMemories.epoch, claimed.epoch), gt(assistantMemories.lockedUntil, new Date()));
    try {
      // The provider call runs outside the transaction and does not occupy a pool connection.
      const result = await work(claimed);
      await this.database.connection.transaction(async tx => {
        const [row] = await tx.select().from(assistantMemories).where(ownsLease).for("update");
        if (!row || !row.lockedUntil || row.lockedUntil.getTime() <= Date.now()) throw this.changed();
        await tx.update(assistantMemories).set({
          messages: [...this.liveMessages(row.messages), ...this.added(result.messages ?? [], channel)].slice(-24),
          expiresAt: result.messages?.length ? new Date(Date.now() + RETENTION_MS) : row.expiresAt,
          lockToken: null, lockedUntil: null,
        }).where(ownsLease);
      });
      return result.value;
    } finally {
      await this.database.connection.update(assistantMemories).set({ lockToken: null, lockedUntil: null })
        .where(and(this.where(scope), eq(assistantMemories.lockToken, token)));
    }
  }

  private changed() { return new ConflictException("Історія чату змінилася. Оновіть чат і повторіть запит."); }
}
