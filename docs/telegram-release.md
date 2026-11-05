# Telegram assistant release

The bot uses the existing Groq credentials. Conversational requests use
`GROQ_ASSISTANT_MODEL` (default: `openai/gpt-oss-120b`); document vision keeps
the existing `GROQ_MODEL`. `GROQ_ASSISTANT_MAX_TOKENS` defaults to 2048.

## Before rollout

1. Run `npm test` and `npm run build`.
2. Apply the pending database migrations with `npm run db:migrate` against
   the deployment database. Migrations 0017 and 0018 create conversation
   state and one-time account-link tokens. Migration 0019 adds dated reminders
   and a durable delivery queue; no existing vehicle data is moved.
3. Deploy the backend and frontend together. Backend initialization registers
   Telegram message and callback-query updates, including confirmation buttons.
4. Run `node scripts/check-telegram-deploy.cjs`. It only reads database metadata
   and Telegram bot/webhook status; it does not register or change a webhook.
5. Sign into the website account, open Settings or Integrations, and connect
   Telegram with the one-time link. The link expires after 10 minutes.
6. For reminders, enable and schedule the production worker as described in
   [reminder deployment](reminders.md). Do not enable it in preview/local
   environments sharing the production database.

An existing Telegram account containing cars is not automatically merged into
another website account. Linking refuses that situation to preserve both garages.

## Verification

`npm test` covers actual Telegraf update handling with mocked transports and
domain services, action validation, confirmation/cancellation, repeated updates,
vehicle selection, clarification history, account links, and persisted state.

`npm run test:telegram:live` calls Groq with fixture vehicle data and never
writes to the user's garage or sends a Telegram chat message. Results are written
to ignored `scratch/telegram-ai-check.json`. Optional `TELEGRAM_AI_DELAY_MS`
spaces requests when the provider's token or request quota is low.

The language choices are Ukrainian (default), Polish, and English. The bot follows
the account language; `/language uk`, `/language pl`, and `/language en` change it.
The website uses the same three languages for navigation, forms, statuses,
errors, dates and numbers. Flag images render independently of Windows emoji
support. User-entered vehicle names and records are not translated.

Local verification on 2026-10-30: 48 automated tests and 10/10 live model
scenarios passed using fixture data. All 14 website sections were checked in
three languages at 1440, 1024 and 390 pixels, without production writes.
The real browser-to-API chat flow was also checked, including follow-up history.
The read-only production check on 2026-10-31 confirmed migrations through 0018,
but callback queries were still disabled and the bot command menu was old.
This is an observed deployment issue, not evidence of functioning confirmations.
Migration 0019 and reminder worker activation are new changes and have not been
applied by these local tests. Reminder tests use an isolated in-memory PostgreSQL
instance and mocked Telegram transport, without production writes or AI calls.
Local verification on 2026-10-31: 78 automated tests passed, covering reminder creation, calendar
math, durable sending claims, retries, cancellation and cross-channel conflicts.
The reminder UI was checked in all three languages at 1440 and 390 pixels through
the real local JWT API and an isolated PostgreSQL database. Sending was mocked;
the new live-model fixture scenarios have not been run against a paid provider.

## Behavior

Conversation state survives restarts and expires after 24 hours. Each user has
an isolated history and selected car. Natural-language writes require a preview
and an unexpired confirmation; explicit legacy slash commands remain direct.
All writes use the existing domain services with the authenticated owner ID.
New expenses do not inherit an old odometer reading from the vehicle profile.
Unstated event dates use the domain service's save time; full-tank status and
currency must be explicit. The website refreshes account language and Telegram
link status when returning to the window, without restoring a logged-out session.

The assistant can read current-month spending, recent expenses, energy entries,
consumption, service records, documents, maintenance rules, event history, and
saved-report metadata. Recent lists are bounded; missing modules are marked as
unavailable rather than interpreted as zero values.

The bot proposes mileage, expense, energy, service, document-metadata, maintenance,
vehicle-profile, garage and dated-reminder changes. New VIN reports require a
source-specific confirmation warning about quota or possible charges. File
uploads and non-VIN registry lookups remain website flows. A service record's cost does not automatically become a
financial expense, matching the existing backend contract.

Confirmations are consumed in a durable checkpoint before domain writes or
provider requests. A process failure can leave an unknown outcome, but it never
automatically replays that effect; check the saved record before a fresh request.
Conversation leases release database pool connections during model requests.
