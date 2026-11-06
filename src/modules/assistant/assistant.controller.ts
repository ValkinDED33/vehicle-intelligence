import { Body, Controller, Delete, Get, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";

import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { AssistantConversationService } from "./assistant-conversation.service";
import { AssistantMemoryService } from "./assistant-memory.service";
import { AssistantMemoryScopeDto } from "./dto/assistant-memory.dto";
import { botLanguage } from "../telegram/telegram-conversation.types";
import { UpdateAssistantPreferencesDto } from "./dto/assistant-preferences.dto";
import { AssistantChatDto } from "./dto/assistant-chat.dto";

interface AuthenticatedRequest {
  userId: string;
}

@Controller("assistant")
@UseGuards(JwtAuthGuard)
export class AssistantController {
  constructor(private readonly conversations: AssistantConversationService, private readonly memory: AssistantMemoryService) {}

  @Post("chat")
  chat(@Req() request: AuthenticatedRequest, @Body() dto: AssistantChatDto) {
    return this.conversations.chat({
      ownerId: request.userId,
      message: dto.message,
      vehicleId: dto.vehicleId,
      language: dto.language,
      expectedMemoryEpoch: dto.expectedMemoryEpoch,
    });
  }

  @Get("history")
  history(@Req() request: AuthenticatedRequest, @Query() scope: AssistantMemoryScopeDto) {
    return this.memory.get({ ownerId: request.userId, vehicleId: scope.vehicleId, language: botLanguage(scope.language) });
  }

  @Get("preferences")
  preferences(@Req() request: AuthenticatedRequest) { return this.memory.preferences(request.userId); }

  @Patch("preferences")
  savePreferences(@Req() request: AuthenticatedRequest, @Body() input: UpdateAssistantPreferencesDto) {
    return this.memory.setPreferences(request.userId, input);
  }

  @Delete("history")
  clearHistory(@Req() request: AuthenticatedRequest, @Query() scope: AssistantMemoryScopeDto) {
    return this.memory.clear({ ownerId: request.userId, vehicleId: scope.vehicleId, language: botLanguage(scope.language) });
  }
}
