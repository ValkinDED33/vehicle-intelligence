import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { setTimeout as delay } from "timers/promises";
import { DatabaseService } from "../../common/database/database.service";
import { telegramConversations } from "./schemas/telegram-conversation.schema";
import type { ConversationCheckpoint, ConversationState } from "./telegram-conversation.types";

@Injectable()
export class TelegramSessionService {
  private readonly queues = new Map<string, Promise<void>>();
  constructor(private readonly database: DatabaseService) {}

  async run(userId: string, updateId: number, handler: (state: ConversationState, checkpoint: ConversationCheckpoint) => Promise<void>): Promise<void> {
    const previous = this.queues.get(userId) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(() => this.process(userId, updateId, handler));
    this.queues.set(userId, current);
    try { await current; } finally { if (this.queues.get(userId) === current) this.queues.delete(userId); }
  }

  private async process(userId: string, updateId: number, handler: (state: ConversationState, checkpoint: ConversationCheckpoint) => Promise<void>): Promise<void> {
    const token = randomUUID();
    let state: ConversationState | undefined;
    for (let attempt = 0; attempt < 60; attempt++) {
      // A short DB lease serializes instances without holding pool connections during AI/API calls.
      const claimed = await this.database.connection.transaction(async (tx) => {
        const empty: ConversationState = { history: [], processedUpdates: [] };
        await tx.insert(telegramConversations).values({ userId, state: empty, expiresAt: new Date() }).onConflictDoNothing();
        const [row] = await tx.select().from(telegramConversations)
          .where(eq(telegramConversations.userId, userId)).limit(1).for("update");
        if (row.state.processedUpdates.includes(updateId)) return "duplicate" as const;
        if (row.lockedUntil && row.lockedUntil.getTime() > Date.now()) return null;
        await tx.update(telegramConversations).set({ lockToken: token, lockedUntil: new Date(Date.now() + 5 * 60 * 1000) })
          .where(eq(telegramConversations.userId, userId));
        return row.expiresAt.getTime() > Date.now() ? row.state : { ...empty, processedUpdates: row.state.processedUpdates };
      });
      if (claimed === "duplicate") return;
      if (claimed) { state = claimed; break; }
      await delay(250);
    }
    if (!state) throw new ServiceUnavailableException("Telegram conversation is busy");
    const ownsLock = and(eq(telegramConversations.userId, userId), eq(telegramConversations.lockToken, token));
    const prepareState = () => {
      state!.history = state!.history.slice(-16).map((message) => ({ ...message, content: message.content.slice(0, 3000) }));
      state!.processedUpdates = [...new Set([...state!.processedUpdates, updateId])].slice(-100);
    };
    const checkpoint: ConversationCheckpoint = async () => {
      prepareState();
      const saved = await this.database.connection.update(telegramConversations).set({
        state, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), lockedUntil: new Date(Date.now() + 5 * 60 * 1000),
      }).where(ownsLock).returning({ userId: telegramConversations.userId });
      if (!saved.length) throw new ServiceUnavailableException("Telegram conversation lease was lost");
    };
    try {
      await handler(state, checkpoint);
      prepareState();
      const values = { state, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), lockToken: null, lockedUntil: null };
      await this.database.connection.update(telegramConversations).set(values).where(ownsLock);
    } finally {
      await this.database.connection.update(telegramConversations).set({ lockToken: null, lockedUntil: null }).where(ownsLock);
    }
  }
}
