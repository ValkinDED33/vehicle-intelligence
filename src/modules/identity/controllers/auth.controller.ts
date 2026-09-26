import { Body, Controller, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";

import { LoginDto, RegisterDto } from "../dto/auth.dto";
import { AuthService } from "../services/auth.service";

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
}
