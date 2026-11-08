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

Telegram action state survives restarts and expires after 24 hours. Shared
assistant history is scoped by account, car and language, with up to 24 messages
and a seven-day limit per message; owner preferences persist separately.
Natural-language writes require a preview
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

## Production Check: 2026-11-07

Read-only checks confirmed migration `0023_vin_check_access` with no pending
migrations. `@IACarsBot` has a configured webhook and no pending updates or
reported delivery error, but subscribes only to `message`, not `callback_query`.
The current source registers both types during initialization; a regression test
checks that registration does not discard pending updates.

The owner approved adding callbacks. A safety check of the locally configured
webhook secret returned 401, so the repair stopped BEFORE `setWebhook` and did
not change the existing URL, secret or queue. Access to the current Render
configuration is required; the owner deferred signing in. Never work around
this by removing the secret header or disabling webhook authentication.

The live test account reports `deliveryEnabled:false` and is not linked to
Telegram. Real reminder delivery and button confirmation remain unverified.
Do not enable a production worker indiscriminately: queued reminders for other
accounts may become eligible. Arrange a controlled test after deployment and
account linkage. The latest VIN/assistant fixes are local, not yet deployed.

### Render Configuration Inspection

After the owner signed in, the active service was identified as
`srv-d9u99h61egvs739e0ltg` (`vehicle-intelligence`) in the `hw3-crud` project.
Its public URL matches `https://vehicle-intelligence-o9mi.onrender.com`.
The similarly named `vehicle-intelligence-1` in the `vehicle-intelligence`
project uses a different hostname and has failed deploys; do not configure
or redeploy that duplicate in an attempt to repair the production bot.

The active service's environment has no `TELEGRAM_BOT_TOKEN`,
`TELEGRAM_WEBHOOK_URL` or `TELEGRAM_WEBHOOK_SECRET`, and no linked environment
groups or secret files supplying them. This explains the initialization guard
disabling Telegram and the webhook secret check returning 401. It is not
evidence that the local secret differs from an existing production secret.

A three-variable import was prepared from the existing local configuration in
ignored `scratch/render-telegram-import.env`, with a Windows ACL restricted to
the current user. No credential values were printed or added to Git. The Render
import dialog was opened, but no credentials were entered or uploaded by the
agent. Importing and saving credentials is handed to the owner. Do not claim
that the bot is enabled until the owner saves the environment, deployment
completes and read-only webhook checks confirm message and callback updates.

### Render Activation Completed: 2026-11-07

The owner imported Telegram settings and deployed commit `8261dd6` as
`dep-dbnmloe7bikc73cvql0g`. Render reported Live and startup logged a connected
webhook. Read-only Telegram checks confirmed `callback_query` enabled, zero
pending updates and no delivery error. An authenticated no-op update returned
200; the same request without a secret returned 401. No chat message was sent.

The owner then explicitly approved enabling automatic reminders. Before the
change, PostgreSQL had zero pending/due/claimed deliveries and zero active
Telegram-enabled maintenance rules. Only `REMINDERS_WORKER_ENABLED=true` was
added; existing environment keys, bot credentials and VIN settings were preserved.

The first worker deployment (`dep-dbnmophsrm7s739sogsg`) failed because an
uncaught Telegram `setMyCommands` network error (`ETIMEDOUT`) aborted startup,
not because of the worker setting. The preceding version remained Live. One
retry of the same main commit succeeded as `dep-dbnmqqff3r2c7393e2b0`; no
rollback, cache purge, Auto-Deploy change or second code version was involved.
Post-deployment API checks confirmed `deliveryEnabled:true`, a used VIN trial
and exactly one saved VIN result. Telegram readiness checks still pass. The
test account remains unlinked, so real message receipt is not yet verified.

The observed startup failure is fixed locally: register incoming updates before
optional menus, bound each setup request to eight seconds, keep the API running
on provider failure, retry setup at most three times with delay, cancel retry
timers during shutdown and never rethrow/log credential-bearing transport errors.
Tests include the actual Telegraf HTTP client's native abort handling against a
local server. `npm test`: 136/136 passed. The owner explicitly deferred committing
and pushing these fixes; production still runs `8261dd6` without this protection
or the other pending local VIN/assistant changes.

Remaining release checks: link the intended website account to Telegram, confirm
a harmless proposed action using a real button, and receive a short-lived test
reminder. The free Render service still sleeps; activation alone does not provide
an always-awake scheduler or guarantee delivery while the process is asleep.

### Follow-up Check: 2026-11-08

A later external push deployed `8b88ade` as `dep-dbnmtfi9lscs73c7rleg`, superseding
the earlier `8261dd6` checkpoint above. The bounded Telegram setup and saved VIN /
assistant fixes are therefore no longer only local. The agent did not commit or
push them. Reminder delivery is enabled; the read-only queue check was empty.
The owner reports Telegram linked to the intended account, not the separate test
account. A real confirmed action and receipt of a scheduled Telegram message are
still not verified. No paid plan or external scheduler has been activated.

Additional local dependency updates passed clean installation and `npm audit`
with zero known vulnerabilities. The malformed compressed-body regression returns
400 and leaves the HTTP server usable. Claimed reminder jobs display a translated
sending state. After the vehicle artwork changes, `npm test` passes 139 tests.
These newer local changes have not been pushed or deployed by the agent.
