import { Body, Controller, Get, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";

import { JwtAuthGuard } from "../../../common/guards/jwt-auth.guard";
import {
  LoginDto,
  RegisterDto,
  TelegramAuthDto,
  UpdateProfileDto,
} from "../dto/auth.dto";
import { AuthService } from "../services/auth.service";

interface AuthenticatedRequest {
  userId: string;
}

@Controller("auth")
@Throttle({ default: { limit: 10, ttl: 60_000 } })
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("register")
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post("login")
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post("telegram")
  telegram(@Body() dto: TelegramAuthDto) {
    return this.authService.loginWithTelegram(dto);
  }

  @Get("me")
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @UseGuards(JwtAuthGuard)
  getMe(@Req() request: AuthenticatedRequest) {
    return this.authService.getProfile(request.userId);
  }

  @Patch("me")
  @UseGuards(JwtAuthGuard)
  updateMe(@Req() request: AuthenticatedRequest, @Body() dto: UpdateProfileDto) {
    return this.authService.updateProfile(request.userId, dto);
  }

  @Post("telegram/link")
  @UseGuards(JwtAuthGuard)
  telegramLink(@Req() request: AuthenticatedRequest) {
    return this.authService.createTelegramLink(request.userId);
  }
}
