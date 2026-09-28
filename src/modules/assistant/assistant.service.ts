import { Injectable } from "@nestjs/common";

import { AiGatewayService } from "../../common/ai-gateway/ai-gateway.service";
import { GarageService } from "../garage/services/garage.service";
import { MaintenanceService } from "../maintenance/services/maintenance.service";
import { MileageService } from "../mileage/services/mileage.service";
import { VehicleProfileService } from "../vehicle-profile/services/vehicle-profile.service";

interface AssistantChatInput {
  ownerId: string;
  message: string;
  vehicleId?: string;
}

export interface AssistantChatResponse {
  answer: string;
  provider: string;
  model: string;
}

@Injectable()
export class AssistantService {
  constructor(
    private readonly aiGatewayService: AiGatewayService,
    private readonly garageService: GarageService,
    private readonly vehicleProfileService: VehicleProfileService,
    private readonly mileageService: MileageService,
    private readonly maintenanceService: MaintenanceService,
  ) {}

  async chat(input: AssistantChatInput): Promise<AssistantChatResponse> {
    const context = input.vehicleId
      ? await this.buildVehicleContext(input.ownerId, input.vehicleId)
      : "Автомобиль не выбран.";

    const response = await this.aiGatewayService.complete({
      systemPrompt:
        "Ты CARA, автомобильный AI-ассистент. Отвечай по-русски, кратко и практично. " +
        "Опирайся на предоставленные факты об автомобиле. Если данных нет, честно скажи, что нужно добавить или проверить. " +
        "Не выдумывай сервисную историю, пробег, комплектацию или регламенты.",
      userPrompt: `Контекст:\n${context}\n\nВопрос пользователя:\n${input.message.trim()}`,
    });

    return {
      answer: response.text,
      provider: response.provider,
      model: response.model,
    };
  }

  private async buildVehicleContext(
    ownerId: string,
    vehicleId: string,
  ): Promise<string> {
    const vehicle = await this.garageService.getVehicle(ownerId, vehicleId);

    const [profile, latestMileage, maintenance] = await Promise.all([
      this.vehicleProfileService.getCurrentProfile(ownerId, vehicleId),
      this.mileageService.getLatestReading(ownerId, vehicleId),
      this.maintenanceService.getStatus(ownerId, vehicleId),
    ]);

    const maintenanceLines = maintenance
      .filter((item) => item.urgency !== "normal")
      .slice(0, 6)
      .map(
        (item) =>
          `- ${item.rule.title}: ${item.urgency}, remaining km=${item.kmRemaining ?? "unknown"}, days=${item.daysRemaining ?? "unknown"}`,
      );

    return [
      `Vehicle: ${[
        vehicle.make,
        vehicle.model,
        vehicle.modelYear,
        vehicle.vin ? `VIN ${vehicle.vin}` : null,
      ]
        .filter(Boolean)
        .join(" ") || vehicle.nickname || vehicle.id}`,
      `Country: ${vehicle.country}`,
      latestMileage
        ? `Latest mileage: ${latestMileage.odometerKm} km at ${latestMileage.recordedAt.toISOString()}`
        : "Latest mileage: unknown",
      profile
        ? `Profile: engine=${profile.engineFamily ?? "unknown"} ${profile.engineCode ?? ""}, fuel=${profile.fuelType ?? "unknown"}, power=${profile.powerHp ?? "unknown"} hp, transmission=${profile.transmissionType ?? "unknown"}, drive=${profile.driveType ?? "unknown"}`
        : "Profile: not filled",
      maintenanceLines.length > 0
        ? `Maintenance alerts:\n${maintenanceLines.join("\n")}`
        : "Maintenance alerts: none",
    ].join("\n");
  }
}
