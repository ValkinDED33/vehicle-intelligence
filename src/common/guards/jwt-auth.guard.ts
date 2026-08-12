import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";

interface JwtPayload {
  sub: string;
  email: string;
}

interface AuthenticatedRequest {
  headers: {
    authorization?: string;
  };
  userId?: string;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    const authorization = request.headers.authorization;

    if (!authorization?.startsWith("Bearer ")) {
      throw new UnauthorizedException("Отсутствует токен авторизации");
    }

    const token = authorization.slice("Bearer ".length).trim();

    if (!token) {
      throw new UnauthorizedException("Отсутствует токен авторизации");
    }

    const jwtSecret = this.configService.get<string>("JWT_SECRET");

    if (!jwtSecret) {
      throw new Error("JWT_SECRET environment variable is required");
    }

    try {
      const payload = this.jwtService.verify<JwtPayload>(token, {
        secret: jwtSecret,
      });

      if (!payload.sub) {
        throw new UnauthorizedException("Некорректный токен авторизации");
      }

      request.userId = payload.sub;

      return true;
    } catch (error: unknown) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      throw new UnauthorizedException("Недействительный или истёкший токен");
    }
  }
}
