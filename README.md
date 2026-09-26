# IA-CARS · Vehicle Intelligence

«Цифровая медицинская карта автомобиля»: единый профиль машины, собирающий данные из VIN-баз, документов (OCR + AI), истории обслуживания, пробегов и расходов.

Монорепозиторий: NestJS-бэкенд в корне, фронтенд CARA — в `frontend/`.

## Стек

- **Backend:** NestJS 10, TypeScript (strict), Drizzle ORM + PostgreSQL (Neon), JWT + bcrypt, @nestjs/throttler, AWS S3-совместимое хранилище (Backblaze B2), pdfjs-dist + @napi-rs/canvas (рендер PDF), Groq (LLM/Vision) через AI Gateway.
- **Frontend:** Vite + React 19 (`frontend/`).

## Быстрый старт

```bash
npm install
cd frontend && npm install && cd ..

cp .env.example .env   # заполнить DATABASE_URL, JWT_SECRET, GROQ_API_KEY, B2_*, VIN_PROVIDER_API_KEY

npm run db:migrate     # применить миграции Drizzle
npm run start:dev      # бэкенд на http://localhost:3000
npm run dev:web        # фронтенд на http://localhost:5173
```

Проверка здоровья: `GET /health` (база + объектное хранилище).

## Скрипты

| Команда | Назначение |
|---|---|
| `npm run start:dev` | бэкенд в watch-режиме |
| `npm run build` / `start:prod` | прод-сборка / запуск |
| `npm run dev:web` / `build:web` | фронтенд dev / build |
| `npm run db:generate` | сгенерировать миграцию по схемам Drizzle |
| `npm run db:migrate` | применить миграции |
| `npm run db:studio` | Drizzle Studio |

## Модули бэкенда (`src/modules/`)

| Модуль | Назначение |
|---|---|
| `identity` | регистрация/логин, JWT |
| `garage` | автомобили пользователя (Vehicle) |
| `vehicle-profile` | версионный технический профиль (двигатель, КПП, привод и т.д.) |
| `vin` | декодирование VIN (Vehicle Databases: Europe VIN Decode, Advanced VIN Decode) |
| `external-reports` | внешние отчёты; сырые ответы провайдеров сохраняются в `vehicle_external_reports` |
| `vehicle-history` | единая timeline событий автомобиля с provenance |
| `mileage` | история пробегов (значение + дата + источник + confidence), защита от отката одометра и детект аномалий |
| `maintenance` | регламент обслуживания (что должно быть сделано) |
| `service-records` | фактические сервисные записи (работы, запчасти, стоимость) |
| `energy` | заправки, расход full-to-full |
| `expenses` | расходы на автомобиль |
| `documents` | загрузка документов в B2, OCR/AI-извлечение фактов |

Общая инфраструктура — `src/common/`: `database`, `object-storage`, `ai-gateway` (Groq), `auth` (глобальный JwtModule), `health`, `guards`, `pipes`.

## Внешние источники

Провайдер Vehicle Databases (`x-authkey`):

- Europe VIN Decode: `GET https://api.vehicledatabases.com/europe-vin-decode/v2/{vin}` — основной декодер (env `VIN_PROVIDER_URL`, `VIN_PROVIDER_API_KEY`).
- Advanced VIN Decode: `.../advanced-vin-decode/v2/{vin}` (env `ADVANCED_VIN_PROVIDER_URL` — опциональный оверрайд).
- Vehicle history: URL задаётся `VEHICLE_HISTORY_PROVIDER_URL`.

Результаты не сваливаются в один JSON: каждый источник нормализуется в свою сущность (спецификации → VehicleProfile, аукционы/продажи → VehicleHistory, пробеги → Mileage), а сырой ответ всегда сохраняется в `vehicle_external_reports`.

Мультиисточниковая загрузка (17 VIN-endpoint'ов каталога Vehicle Databases):

```
GET  /vehicles/:vehicleId/external-reports/sources          # каталог источников
POST /vehicles/:vehicleId/external-reports/sources          # опросить все (батчами)
POST /vehicles/:vehicleId/external-reports/sources/:source  # один источник
GET  /vehicles/:vehicleId/external-reports?type=<source>    # сохранённые отчёты
```

Статусы отчётов: `success` (есть данные), `no-data` (upstream: «Record(s) were not found»), `failed` (ошибка запроса, сохраняется с описанием).

## Детект аномалий пробега

```
GET  /vehicles/:vehicleId/mileage/anomalies   # анализ сохранённых показаний
```

Анализирует хронологию показаний и находит: `rollback` (пробег со временем уменьшился — признак скрутки одометра; `severity: critical` при падении ≥ 100 км) и `implausible_jump` (средний прирост > 2000 км/сутки — вероятная ошибка данных). Ответ: `{ vehicleId, readingsAnalyzed, anomalies[] }`.

Запись показаний: для пользовательских источников (`manual`/`web`/`telegram` и т.п.) уменьшение пробега относительно сохранённого максимума отклоняется (защита от опечаток). Внешние исторические источники (`vdb:*`) сохраняются как есть — даже если показывают меньший пробег, — чтобы детект мог найти откат по всей хронологии.

## Переменные окружения

См. `.env.example`. Обязательны `DATABASE_URL` и `JWT_SECRET` — без них приложение не стартует.

## Деплой

**Один origin (Render).** Бэкенд сам раздаёт собранный фронт из `frontend/dist`
(`src/main.ts`). Перед деплоем выполните `npm run build:web`, затем обычный деплой API —
сайт и API будут на одном адресе без CORS.

**Два origin (Vercel + Render).** Корневой `vercel.json` собирает `frontend/`
(`npm --prefix frontend ci && npm --prefix frontend run build`) и публикует `frontend/dist`,
поэтому Vercel-проект может указывать на корень репозитория. В окружении Vercel задайте
`VITE_API_URL=https://vehicle-intelligence-o9mi.onrender.com`. Бэкенд разрешает origin
Vercel через CORS (по умолчанию в списке `https://vehicle-intelligence-nu.vercel.app`,
переопределяется `CORS_ORIGINS`).

В dev-режиме фронт ходит в API через vite-proxy (`frontend/vite.config.ts`), поэтому
`VITE_API_URL` локально не нужен.
