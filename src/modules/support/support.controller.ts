import { Body, Controller, Get, Header, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { SupportAccessService } from "./support-access.service";
import { SupportAdminGuard } from "./support-admin.guard";
import { AdminSupportTicketQueryDto, CreateSupportTicketDto, SupportMessageDto, SupportStatusDto, SupportTicketQueryDto } from "./support.dto";
import { SupportService } from "./support.service";

type AuthenticatedRequest = { userId: string };

@Controller("support")
@UseGuards(JwtAuthGuard)
export class SupportController {
  constructor(private readonly support: SupportService, private readonly permission: SupportAccessService) {}

  @Get("access")
  @Header("Cache-Control", "no-store")
  access(@Req() req: AuthenticatedRequest) { return this.permission.access(req.userId); }

  @Get("tickets")
  @Header("Cache-Control", "no-store")
  list(@Req() req: AuthenticatedRequest, @Query() query: SupportTicketQueryDto) { return this.support.list(req.userId, query); }

  @Post("tickets")
  @Header("Cache-Control", "no-store")
  create(@Req() req: AuthenticatedRequest, @Body() input: CreateSupportTicketDto) { return this.support.create(req.userId, input); }

  @Get("tickets/:id")
  @Header("Cache-Control", "no-store")
  get(@Req() req: AuthenticatedRequest, @Param("id") id: string) { return this.support.get(req.userId, id); }

  @Post("tickets/:id/messages")
  @Header("Cache-Control", "no-store")
  reply(@Req() req: AuthenticatedRequest, @Param("id") id: string, @Body() input: SupportMessageDto) { return this.support.reply(req.userId, id, input); }
}

@Controller("admin/support/tickets")
@UseGuards(JwtAuthGuard, SupportAdminGuard)
export class AdminSupportController {
  constructor(private readonly support: SupportService) {}

  @Get()
  @Header("Cache-Control", "no-store")
  list(@Req() req: AuthenticatedRequest, @Query() query: AdminSupportTicketQueryDto) { return this.support.adminList(req.userId, query); }

  @Get(":id")
  @Header("Cache-Control", "no-store")
  get(@Req() req: AuthenticatedRequest, @Param("id") id: string) { return this.support.adminGet(req.userId, id); }

  @Post(":id/messages")
  @Header("Cache-Control", "no-store")
  reply(@Req() req: AuthenticatedRequest, @Param("id") id: string, @Body() input: SupportMessageDto) { return this.support.adminReply(req.userId, id, input); }

  @Patch(":id/status")
  @Header("Cache-Control", "no-store")
  status(@Req() req: AuthenticatedRequest, @Param("id") id: string, @Body() input: SupportStatusDto) { return this.support.adminStatus(req.userId, id, input); }
}
