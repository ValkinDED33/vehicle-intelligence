import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { AiGatewayModule } from "./common/ai-gateway/ai-gateway.module";
import { DatabaseModule } from "./common/database/database.module";
import { EventBusModule } from "./common/event-bus/event-bus.module";
import { HealthModule } from "./common/health/health.module";
import { ModuleRegistryModule } from "./common/module-registry/module-registry.module";
import { IdentityModule } from "./modules/identity/identity.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
    }),

    DatabaseModule,
    EventBusModule,
    ModuleRegistryModule,
    AiGatewayModule,
    HealthModule,
    IdentityModule,
  ],
})
export class AppModule {}
