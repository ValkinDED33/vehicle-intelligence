import { Injectable } from "@nestjs/common";
import { AssistantService, type AssistantChatInput, type AssistantTurn } from "./assistant.service";
import { AssistantMemoryService } from "./assistant-memory.service";
import { botLanguage, botText } from "../telegram/telegram-conversation.types";
import type { MemoryReference, MemoryScope } from "./assistant-memory.types";

export type RememberedAssistantTurn = AssistantTurn & { memoryReference: MemoryReference };

@Injectable()
export class AssistantConversationService {
  constructor(private readonly assistant: AssistantService, private readonly memory: AssistantMemoryService) {}

  async chat(input: AssistantChatInput & { expectedMemoryEpoch?: number }) {
    const scope: MemoryScope = { ownerId: input.ownerId, vehicleId: input.vehicleId, language: botLanguage(input.language) };
    const response = await this.memory.run(scope, "web", async snapshot => {
      const result = await this.assistant.chat({ ...input, preferences: await this.memory.preferences(input.ownerId), history: snapshot.messages.slice(-12).map(({ role, content }) => ({ role, content: content.slice(0, 3000) })) });
      return { value: result, messages: [{ role: "user", content: input.message }, { role: "assistant", content: result.answer }] };
    }, input.expectedMemoryEpoch);
    return { ...response, history: await this.memory.get(scope) };
  }

  async planTurn(input: AssistantChatInput): Promise<RememberedAssistantTurn> {
    const scope: MemoryScope = { ownerId: input.ownerId, vehicleId: input.vehicleId, language: botLanguage(input.language) };
    return this.memory.run(scope, "telegram", async snapshot => {
      const turn = await this.assistant.planTurn({ ...input, preferences: await this.memory.preferences(input.ownerId), history: snapshot.messages.slice(-12).map(({ role, content }) => ({ role, content: content.slice(0, 3000) })) });
      const target = (turn.action as { vehicleId?: string } | null)?.vehicleId ?? turn.selectedVehicleId;
      const redirected = (target !== undefined && target !== input.vehicleId) || (turn.selectedVehicleId !== undefined && turn.selectedVehicleId !== input.vehicleId);
      const reply = turn.action ? botText(scope.language,
        "Підготовлено пропозицію. Змін ще не збережено; потрібне окреме підтвердження в Telegram.",
        "Przygotowano propozycję. Zmiany nie zostały zapisane; wymagane jest osobne potwierdzenie w Telegramie.",
        "A proposal has been prepared. No changes have been saved; separate confirmation in Telegram is required.") : turn.answer;
      return {
        value: { ...turn, memoryReference: { vehicleId: input.vehicleId, language: scope.language, epoch: snapshot.epoch } },
        messages: redirected ? [] : [{ role: "user", content: input.message }, { role: "assistant", content: reply }],
      };
    });
  }
}
