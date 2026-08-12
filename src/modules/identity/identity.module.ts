import { Module, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtModule, type JwtModuleOptions } from "@nestjs/jwt";

import { ModuleRegistryService } from "../../common/module-registry/module-registry.service";
import { AuthController } from "./controllers/auth.controller";
import { IdentityDbService } from "./identity.db.service";
import { AuthService } from "./services/auth.service";

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService): JwtModuleOptions => {
        const jwtSecret = configService.get<string>("JWT_SECRET");

        if (!jwtSecret) {
          throw new Error("JWT_SECRET environment variable is required");
        }

        return {
          secret: jwtSecret,
          signOptions: {
            expiresIn: "7d",
          },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [IdentityDbService, AuthService],
  exports: [AuthService],
})
export class IdentityModule implements OnModuleInit {
  constructor(private readonly moduleRegistry: ModuleRegistryService) {}

  onModuleInit(): void {
    this.moduleRegistry.register({
      id: "identity",
      version: "0.1.0",
      description: "Accounts, authentication, and owner preferences",
      commands: [
        {
          name: "register",
          description: "Register a new user",
        },
        {
          name: "login",
          description: "Authenticate a user and issue JWT",
        },
      ],
      events: [],
      data: ["users"],
      aiTools: [],
      notifications: [],
      uiSlots: [],
      telegramActions: [],
      permissions: [
        {
          scope: "self.profile",
          access: "read-write",
        },
      ],
    });
  }
}
