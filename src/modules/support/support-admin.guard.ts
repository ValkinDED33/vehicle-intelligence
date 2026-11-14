import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { SupportAccessService } from "./support-access.service";

@Injectable()
export class SupportAdminGuard implements CanActivate {
  constructor(private readonly access: SupportAccessService) {}
  canActivate(context: ExecutionContext): boolean {
    this.access.assertAdmin(context.switchToHttp().getRequest<{ userId: string }>().userId);
    return true;
  }
}
