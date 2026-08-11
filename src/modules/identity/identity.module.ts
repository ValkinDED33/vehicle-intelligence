import { Module, OnModuleInit } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { User, UserSchema } from './schemas/user.schema';
import { AuthService } from './services/auth.service';
import { AuthController } from './controllers/auth.controller';
import { ModuleRegistryService } from '../../common/module-registry/module-registry.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? 'change_me_before_prod',
      signOptions: { expiresIn: process.env.JWT_EXPIRES_IN ?? '7d' },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService],
})
export class IdentityModule implements OnModuleInit {
  constructor(private readonly moduleRegistry: ModuleRegistryService) {}

  onModuleInit() {
    this.moduleRegistry.register({
      id: 'identity',
      version: '0.1.0',
      description: 'Аккаунты, авторизация, профиль владельца, страна/язык',
      commands: [
        { name: 'register', description: 'Регистрация нового пользователя' },
        { name: 'login', description: 'Вход и получение JWT' },
      ],
      events: [],
      data: ['users'],
      aiTools: [],
      notifications: [],
      uiSlots: [{ slot: 'account-settings', description: 'Настройки профиля пользователя' }],
      telegramActions: [{ command: '/start', description: 'Регистрация/привязка аккаунта в Telegram' }],
      permissions: [{ scope: 'self.profile', access: 'read-write' }],
    });
  }
}
