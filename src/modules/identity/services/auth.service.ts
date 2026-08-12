import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";

import { IdentityDbService } from "../identity.db.service";
import { LoginDto, RegisterDto } from "../dto/auth.dto";
import type { User } from "../schemas/user.schema";

@Injectable()
export class AuthService {
  private static readonly PASSWORD_SALT_ROUNDS = 12;

  constructor(
    private readonly identityDbService: IdentityDbService,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const email = dto.email.trim().toLowerCase();

    const existingUser = await this.identityDbService.findByEmail(email);

    if (existingUser) {
      throw new ConflictException("Пользователь с таким email уже существует");
    }

    const passwordHash = await bcrypt.hash(
      dto.password,
      AuthService.PASSWORD_SALT_ROUNDS,
    );

    try {
      const user = await this.identityDbService.createUser({
        email,
        passwordHash,
        displayName: dto.displayName,
        country: dto.country,
        language: dto.language,
      });

      return this.buildAuthResponse(user);
    } catch (error: unknown) {
      if (this.isUniqueConstraintViolation(error)) {
        throw new ConflictException(
          "Пользователь с таким email уже существует",
        );
      }

      throw error;
    }
  }

  async login(dto: LoginDto) {
    const email = dto.email.trim().toLowerCase();

    const user = await this.identityDbService.findByEmail(email);

    if (!user) {
      throw new UnauthorizedException("Неверный email или пароль");
    }

    const passwordMatches = await bcrypt.compare(
      dto.password,
      user.passwordHash,
    );

    if (!passwordMatches) {
      throw new UnauthorizedException("Неверный email или пароль");
    }

    return this.buildAuthResponse(user);
  }

  private buildAuthResponse(user: User) {
    const payload = {
      sub: user.id,
      email: user.email,
    };

    return {
      accessToken: this.jwtService.sign(payload),

      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        country: user.country,
        language: user.language,
      },
    };
  }

  private isUniqueConstraintViolation(error: unknown): boolean {
    if (typeof error !== "object" || error === null || !("code" in error)) {
      return false;
    }

    return error.code === "23505";
  }
}
