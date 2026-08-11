# avto-platform-core

Backend-скелет платформы «Цифровой двойник автомобиля» —
**Этап 1** (Core + авторизация + Garage + Vehicle Profile + VIN),
**Этап 2** (история машины + обслуживание + пробег + документы) и
**Этап 3** (Telegram + топливо/энергия + расходы + уведомления) и
**Этап 4** (AI-помощник и диагностика конкретной машины) и
**Этап 5** (Proactive Car Brain — погода, сезонность, умные предупреждения).

Стек: Node.js / NestJS / TypeScript / MongoDB (Mongoose).

## Быстрый старт

```bash
npm install
cp .env.example .env
# отредактировать .env: MONGO_URI, JWT_SECRET
npm run start:dev
```

Требуется локальный или удалённый MongoDB (см. `MONGO_URI` в `.env`).

## Структура

```
src/
├── common/
│   ├── event-bus/        # единая шина событий (VehicleEvent, ТЗ п.3.2)
│   ├── module-registry/  # реестр модулей и их контрактов (ТЗ п.3.1)
│   ├── urgency/           # единая шкала срочности 🟢🟡🟠🔴 (ТЗ п.4.12)
│   └── guards/            # JwtAuthGuard
├── modules/
│   ├── identity/          # регистрация, логин, JWT
│   ├── garage/             # список машин пользователя + архив
│   ├── vehicle-profile/    # Vehicle Capability Profile, версионирование
│   ├── vin/                  # VIN-lookup (заглушка провайдера, см. ниже)
│   ├── vehicle-history/      # автозапись ЛЮБОГО события шины — единый источник фактов
│   ├── mileage/               # пробег/моточасы как временной ряд
│   ├── service/                # Service Brain — регламент ТО, статус по узлам
│   ├── documents/              # чеки/фактуры, OCR-стаб, подтверждение → событие истории
│   ├── fuel-energy/            # бензин/дизель/LPG/EV-зарядка, расход и стоимость
│   ├── expenses/                # агрегация расходов из vehicle-history, без своей схемы
│   ├── telegram/                # webhook, роутинг свободного ввода в остальные модули
│   └── diagnostics/             # AI Diagnostic Assistant — вопросы по машине
│   └── proactive-brain/         # погода/сезонность/ТО/пробег + Relevance Score
├── common/notifications/       # Notification Engine — единая точка создания уведомлений
├── common/ai-runtime/          # обёртка над LLM-провайдером (сейчас Anthropic API)
├── config/
└── app.module.ts
```

## Как устроена расширяемость

Каждый модуль в `onModuleInit()` регистрирует себя в `ModuleRegistryService`:
командами, событиями, данными, AI tools, уведомлениями, UI-слотами,
Telegram-действиями и правами доступа — см. `ModuleContract`
(`src/common/module-registry/interfaces/module-contract.interface.ts`).

Просмотреть все зарегистрированные модули: `GET /module-registry`.

Модули общаются между собой **только** через `EventBusService.publish()` /
`EventBusService.on()`, используя единый формат `VehicleEvent`
(`src/common/event-bus/interfaces/vehicle-event.interface.ts`). Прямых
вызовов сервисов между независимыми модулями (кроме явных `imports`, как
`vin` → `vehicle-profile`) быть не должно.

Чтобы добавить новый модуль (например, будущий `obd-module`):
1. Создать `src/modules/obd/` по образцу существующих модулей.
2. Подписаться на нужные события через `EventBusService`.
3. Зарегистрировать контракт в `onModuleInit()`.
4. Подключить модуль в `app.module.ts`.
Остальные модули менять не нужно.

## Что уже реализовано (Definition of Done Этапа 1)

- [x] Схемы БД: `users`, `vehicles` (с архивом), `vehicle_capability_profiles` (с версионированием).
- [x] Event Bus работает end-to-end (`garage.vehicle_added`, `vin.lookup_completed`, `vehicle_profile.confirmed`).
- [x] Module Registry принимает контракты модулей, есть `GET /module-registry`.
- [x] VIN → создание черновика профиля → подтверждение пользователем (`PATCH /vehicles/:id/profile/:profileId/confirm`).
- [x] Права доступа: JWT + фильтрация машин по `ownerId`.
- [ ] Дизайн-система / веб-UI — не входит в этот скелет (отдельная задача фронтенда, см. `frontend-design`).

## Открытые вопросы (перенесены из ТЗ, раздел 8)

- Провайдер VIN-данных не выбран — `VinService.lookup()` возвращает заглушку.
- Провайдер OCR не выбран — `DocumentsService.runOcrStub()` возвращает заглушку
  с низкой `confidence` (0.4); реальные значения появятся, когда пользователь
  подтвердит документ вручную через `PATCH .../documents/:id/confirm`.
- Хранилище файлов (S3-совместимое или иное) не выбрано — `documents` пока
  принимает уже готовую ссылку `fileRef`, а не сам файл.

В обоих случаях меняется только тело одного метода — контракты модулей и
Event Bus не затрагиваются.

## Как работает Service Brain (Этап 2)

`service` не хранит собственную историю замен — он читает последнее
событие нужного типа из `vehicle-history` (`historyEventType` в регламенте,
например `"service.oil_change"`) и текущий пробег из `mileage`, после чего
считает `kmSinceService` / `monthsSinceService` относительно интервала и
возвращает уровень срочности 🟢/🟡/🟠 (`GET /vehicles/:id/service/status`).
Событие `"service.oil_change"` в истории появляется либо вручную, либо
через подтверждённый документ (`documents` → `resultingEventType`).

## Основные эндпоинты

| Метод | Путь | Описание |
|---|---|---|
| POST | `/auth/register` | Регистрация |
| POST | `/auth/login` | Вход, получение JWT |
| POST | `/garage/vehicles` | Добавить машину |
| GET | `/garage/vehicles?status=active\|archived` | Список машин |
| PATCH | `/garage/vehicles/:id/archive` | Архивировать (продана) |
| POST | `/vehicles/:vehicleId/vin/lookup` | VIN-lookup → черновик профиля |
| GET | `/vehicles/:vehicleId/profile/current` | Текущий подтверждённый профиль |
| GET | `/vehicles/:vehicleId/profile/history` | История версий профиля |
| PATCH | `/vehicles/:vehicleId/profile/:profileId/confirm` | "Да, это моя машина" |
| GET | `/module-registry` | Список подключённых модулей и их контрактов |
| GET | `/vehicles/:vehicleId/history?type=&from=&to=&minMileage=&maxMileage=` | Поиск по истории машины |
| POST | `/vehicles/:vehicleId/mileage` | Добавить показание пробега/моточасов |
| GET | `/vehicles/:vehicleId/mileage/latest` | Последний пробег + флаг "устарело" (>30 дней) |
| GET | `/vehicles/:vehicleId/mileage/history` | История пробега |
| POST | `/vehicles/:vehicleId/service/regulations` | Задать регламент обслуживания узла |
| GET | `/vehicles/:vehicleId/service/status` | Статус по всем узлам с уровнем срочности |
| POST | `/vehicles/:vehicleId/documents` | Загрузить документ (запускает OCR-стаб) |
| GET | `/vehicles/:vehicleId/documents` | Список документов |
| PATCH | `/vehicles/:vehicleId/documents/:id/confirm` | Подтвердить/поправить распознанные данные → событие в историю |
| PATCH | `/vehicles/:vehicleId/documents/:id/reject` | Отклонить документ |
| POST | `/vehicles/:vehicleId/energy` | Записать заправку/зарядку |
| GET | `/vehicles/:vehicleId/energy/stats?from=&to=` | Расход и стоимость за период |
| GET | `/vehicles/:vehicleId/expenses/summary?from=&to=` | Расходы по категориям + стоимость на 1 км |
| GET | `/vehicles/:vehicleId/notifications?unreadOnly=` | Список уведомлений |
| PATCH | `/vehicles/:vehicleId/notifications/:id/read` | Отметить прочитанным |
| POST | `/telegram/webhook` | Webhook для входящих сообщений Telegram |
| POST | `/vehicles/:vehicleId/diagnostics/ask` | Задать диагностический вопрос AI |
| GET | `/vehicles/:vehicleId/diagnostics/history` | История диагностических сессий |
| POST | `/system/proactive-brain/run-now` | Ручной запуск ежедневной проверки (без ожидания крона) |

## Proactive Brain и Relevance Score (Этап 5)

`ProactiveBrainService.runDailyCheck()` запускается по крону (`@nestjs/schedule`,
ежедневно в 8:00) и обходит **все активные машины всех пользователей**
(`GarageService.listAllActiveSystemWide()` — системный метод, не для
пользовательских контроллеров). На каждой машине проверяются:

- устаревший пробег (`mileage.isStale`);
- статус ТО по узлам (`service.getStatus`) — уровни 🟡/🟠;
- сезон + погода (`WeatherGatewayService`, провайдер-заглушка — см. открытые вопросы).

Перед КАЖДОЙ отправкой вызывается `RelevanceService.shouldNotify(vehicleId,
suggestionKey, cooldownDays)` — простейшая, но рабочая реализация Relevance
Score из ТЗ п.10: cooldown per suggestionKey per vehicle (14/14/30/3 дня в
зависимости от типа). Более сложная модель (учёт реакции пользователя,
приоритизация между конкурирующими подсказками) заменит текущую логику
без изменения интерфейса `shouldNotify()`.

Провайдер погоды не выбран — `WeatherGatewayService.getForecast()`
возвращает заглушку, аналогично VIN и OCR ранее.

## Как привязать Telegram (Этап 3)

1. В веб-приложении показываем пользователю ссылку `https://t.me/<bot>?start=<userId>`.
2. Пользователь нажимает — бот получает `/start <userId>`, `TelegramService` создаёт
   `TelegramLink` и выбирает первую активную машину как "активную" для чата.
3. Дальше свободный ввод («145600», «заправился на 220», фото чека) роутится
   в `mileage` / `fuel-energy` / `documents` — те же сервисы, что использует веб.

`TelegramApiService.sendMessage()` в этом окружении (без сети) только логирует
исходящие сообщения — реальная отправка включается простой установкой
`TELEGRAM_BOT_TOKEN`, код менять не требуется.

## AI Runtime и диагностика (Этап 4)

`AiRuntimeService` (`common/ai-runtime`) — единственное место, которое знает
о конкретном LLM-провайдере. Сейчас это Anthropic API (`ANTHROPIC_API_KEY`,
`ANTHROPIC_MODEL`), но провайдер официально не выбран (открытый вопрос №3
в ТЗ) — при смене меняется только этот файл.

`diagnostics` строит system-промпт с обязательной структурой ответа
(вероятная причина → почему → что проверить → срочность → альтернативы →
источник + дисклеймер), передаёт в контекст текущий `vehicle-profile` и
последние 20 записей `vehicle-history`, чтобы не переспрашивать то, что уже
известно. Итоговая срочность парсится из тега `URGENCY: ...` в конце ответа
модели; при `check_soon`/`stop` автоматически создаётся уведомление через
`NotificationEngineService`.

Без `ANTHROPIC_API_KEY` `AiRuntimeService` возвращает заглушку — вся
цепочка (диагностика → запись → уведомление) остаётся рабочей и
тестируемой уже сейчас.

В Telegram вопросы (текст с `?`) роутятся в `diagnostics`, а не в общую
заметку — прямая реализация примера из ТЗ п.4.11/п.18.

## Следующие шаги (Этап 6 по ТЗ)

Driver Academy / ПДД — правовой движок с актуальными редакциями по странам,
адаптивное повторение слабых тем, режим имитации экзамена.
