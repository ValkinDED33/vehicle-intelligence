import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import configuration from "./config/configuration";
import { DatabaseModule } from "./common/database/database.module";
import { EventBusModule } from "./common/event-bus/event-bus.module";
import { ModuleRegistryModule } from "./common/module-registry/module-registry.module";
import { AiGatewayModule } from "./common/ai-gateway/ai-gateway.module";
import { HealthModule } from "./common/health/health.module";
import { IdentityModule } from "./modules/identity/identity.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    DatabaseModule,

    // --- Core foundation ---
    EventBusModule,
    ModuleRegistryModule,
    AiGatewayModule,
    HealthModule,

    // --- Minimal feature foundation ---
    IdentityModule,
    // Other feature modules will be added later once domain foundation is stable
  ],
})
export class AppModule {}
