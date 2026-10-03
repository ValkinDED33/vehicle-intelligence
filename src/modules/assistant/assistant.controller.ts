import { Body, Controller, Post, Req, UseGuards } from "@nestjs/common";

import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { AssistantService } from "./assistant.service";
import { AssistantChatDto } from "./dto/assistant-chat.dto";

interface AuthenticatedRequest {
  userId: string;
}

@Controller("assistant")
@UseGuards(JwtAuthGuard)
export class AssistantController {
  constructor(private readonly assistantService: AssistantService) {}

  @Post("chat")
  chat(@Req() request: AuthenticatedRequest, @Body() dto: AssistantChatDto) {
    return this.assistantService.chat({
      ownerId: request.userId,
      message: dto.message,
      vehicleId: dto.vehicleId,
      history: dto.history,
    });
  }
}
