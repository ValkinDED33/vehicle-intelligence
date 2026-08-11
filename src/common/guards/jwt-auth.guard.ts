import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

/**
 * Минимальный guard для Этапа 1. Проверяет Bearer-токен, кладёт userId в req.userId.
 * Далее (Этап 2+) сюда добавляется полноценная система прав доступа (Permissions из
 * контрактов модулей — ТЗ п. 3.1).
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const authHeader: string | undefined = request.headers['authorization'];

    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Отсутствует токен авторизации');
    }

    const token = authHeader.slice('Bearer '.length);
    try {
      const payload = this.jwtService.verify(token, {
        secret: process.env.JWT_SECRET ?? 'change_me_before_prod',
      });
      request.userId = payload.sub;
      return true;
    } catch {
      throw new UnauthorizedException('Недействительный или истёкший токен');
    }
  }
}
