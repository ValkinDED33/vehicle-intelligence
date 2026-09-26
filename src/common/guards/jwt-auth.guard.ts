import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JsonWebTokenError, JwtService, TokenExpiredError } from "@nestjs/jwt";

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
  constructor(private readonly jwtService: JwtService) {}

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

    try {
      const payload = this.jwtService.verify<JwtPayload>(token);

      if (!payload.sub) {
        throw new UnauthorizedException("Некорректный токен авторизации");
      }

      request.userId = payload.sub;

      return true;
    } catch (error: unknown) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      if (error instanceof TokenExpiredError) {
        throw new UnauthorizedException("Токен авторизации истёк");
      }

      if (error instanceof JsonWebTokenError) {
        throw new UnauthorizedException("Недействительный токен авторизации");
      }

      throw error;
    }
  }
}
