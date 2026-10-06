import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";
import { createHmac, timingSafeEqual } from "crypto";

import { IdentityDbService } from "../identity.db.service";
import { LoginDto, RegisterDto, TelegramAuthDto } from "../dto/auth.dto";
import type { User } from "../schemas/user.schema";

interface TelegramWebAppUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  language_code?: string;
}

interface TelegramIdentityProfile {
  id: number | string;
  firstName?: string;
  lastName?: string;
  username?: string;
  photoUrl?: string;
  languageCode?: string;
}

@Injectable()
export class AuthService {
  private static readonly PASSWORD_SALT_ROUNDS = 12;

  constructor(
    private readonly identityDbService: IdentityDbService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async register(dto: RegisterDto) {
    const email = dto.email.trim().toLowerCase();

    const existingUser = await this.identityDbService.findByEmail(email);

    if (existingUser) {
      throw new ConflictException("Не удалось завершить регистрацию");
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
        throw new ConflictException("Не удалось завершить регистрацию");
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

  async loginWithTelegram(dto: TelegramAuthDto) {
    const params = new URLSearchParams(dto.initData);
    const hash = params.get("hash");
    const rawUser = params.get("user");

    if (!hash || !rawUser || !this.isValidTelegramInitData(params, hash)) {
      throw new UnauthorizedException("Не удалось подтвердить вход через Telegram");
    }

    const telegramUser = this.parseTelegramUser(rawUser);
    const user = await this.upsertTelegramUser({
      id: telegramUser.id,
      firstName: telegramUser.first_name,
      lastName: telegramUser.last_name,
      username: telegramUser.username,
      photoUrl: telegramUser.photo_url,
      languageCode: telegramUser.language_code,
    });

    return this.buildAuthResponse(user);
  }

  async upsertTelegramUser(profile: TelegramIdentityProfile): Promise<User> {
    const telegramId = String(profile.id);
    const displayName = this.buildTelegramDisplayName(profile);
    const username = profile.username?.trim() || null;
    const photoUrl = profile.photoUrl?.trim() || null;

    const existingUser = await this.identityDbService.findByTelegramId(
      telegramId,
    );

    if (existingUser) {
      return this.identityDbService.updateTelegramProfile(existingUser.id, {
        displayName:
          displayName || existingUser.displayName || username || "Telegram user",
        telegramUsername: username,
        telegramPhotoUrl: photoUrl,
      });
    }

    const passwordHash = await bcrypt.hash(
      `telegram:${telegramId}:${Date.now()}`,
      AuthService.PASSWORD_SALT_ROUNDS,
    );

    return this.identityDbService.createUser({
      email: `telegram_${telegramId}@telegram.local`,
      passwordHash,
      displayName: displayName || username || "Telegram user",
      country: "PL",
      language: this.normalizeLanguage(profile.languageCode),
      telegramId,
      telegramUsername: username,
      telegramPhotoUrl: photoUrl,
    });
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

  private isValidTelegramInitData(
    params: URLSearchParams,
    receivedHash: string,
  ): boolean {
    const token = this.configService.get<string>("TELEGRAM_BOT_TOKEN")?.trim();
    if (!token) return false;

    const authDate = Number(params.get("auth_date"));
    if (!Number.isFinite(authDate)) return false;

    const maxAgeSeconds = 24 * 60 * 60;
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (nowSeconds - authDate > maxAgeSeconds) return false;

    const dataCheckString = [...params.entries()]
      .filter(([key]) => key !== "hash")
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => `${key}=${value}`)
      .join("\n");

    const secretKey = createHmac("sha256", "WebAppData").update(token).digest();
    const expectedHash = createHmac("sha256", secretKey)
      .update(dataCheckString)
      .digest("hex");

    return this.secureCompare(receivedHash, expectedHash);
  }

  private secureCompare(left: string, right: string): boolean {
    const leftBuffer = Buffer.from(left, "hex");
    const rightBuffer = Buffer.from(right, "hex");

    return (
      leftBuffer.length === rightBuffer.length &&
      timingSafeEqual(leftBuffer, rightBuffer)
    );
  }

  private parseTelegramUser(rawUser: string): TelegramWebAppUser {
    try {
      const parsed = JSON.parse(rawUser) as Partial<TelegramWebAppUser>;

      if (!parsed.id || !Number.isFinite(parsed.id)) {
        throw new Error("Missing Telegram user id");
      }

      return parsed as TelegramWebAppUser;
    } catch {
      throw new UnauthorizedException("Некорректные данные Telegram");
    }
  }

  private buildTelegramDisplayName(user: TelegramIdentityProfile): string {
    return [user.firstName, user.lastName]
      .map((part) => part?.trim())
      .filter((part): part is string => Boolean(part))
      .join(" ");
  }

  private normalizeLanguage(
    languageCode: string | undefined,
  ): "ru" | "uk" | "pl" | "en" {
    const language = languageCode?.slice(0, 2).toLowerCase();
    if (language === "uk" || language === "pl" || language === "en") {
      return language;
    }

    return "ru";
  }
}
