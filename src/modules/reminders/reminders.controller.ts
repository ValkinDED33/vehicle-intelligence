import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { CreateReminderDto, ReminderStatusDto, UpdateReminderDto } from "./reminder.dto";
import { RemindersService } from "./reminders.service";
import { buildReminderSchedule } from "./reminder-schedule";

@Controller("vehicles/:vehicleId/reminders")
@UseGuards(JwtAuthGuard)
export class RemindersController {
  constructor(private readonly reminders: RemindersService) {}
  @Get() list(@Req() req: { userId: string }, @Param("vehicleId") vehicleId: string) {
    return this.reminders.list(req.userId, vehicleId);
  }
  @Post() create(@Req() req: { userId: string }, @Param("vehicleId") vehicleId: string, @Body() input: CreateReminderDto) {
    return this.reminders.save(req.userId, vehicleId, input);
  }
  @Post("preview") async preview(@Req() req: { userId: string }, @Param("vehicleId") vehicleId: string, @Body() input: CreateReminderDto) {
    await this.reminders.list(req.userId, vehicleId);
    return buildReminderSchedule(input);
  }
  @Patch(":reminderId") update(@Req() req: { userId: string }, @Param("vehicleId") vehicleId: string, @Param("reminderId") id: string, @Body() input: UpdateReminderDto) {
    return this.reminders.save(req.userId, vehicleId, input, id, input.expectedRevision);
  }
  @Patch(":reminderId/status") status(@Req() req: { userId: string }, @Param("vehicleId") vehicleId: string, @Param("reminderId") id: string, @Body() input: ReminderStatusDto) {
    return this.reminders.setStatus(req.userId, vehicleId, id, input.status, input.expectedRevision);
  }
}
