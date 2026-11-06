import type { BotLanguage, ConversationMessage } from "../telegram/telegram-conversation.types";

export interface MemoryScope { ownerId: string; vehicleId?: string; language: BotLanguage }
export interface MemoryReference { vehicleId?: string; language: BotLanguage; epoch: number }
export interface MemoryMessage extends ConversationMessage {
  id: string;
  channel: "web" | "telegram";
  createdAt: string;
}
export interface MemorySnapshot { messages: MemoryMessage[]; epoch: number; expiresAt: Date }
export interface MemoryTurnResult<T> { value: T; messages?: ConversationMessage[] }
