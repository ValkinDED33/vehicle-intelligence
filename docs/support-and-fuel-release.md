# Support Inbox And Fuel Corrections

## Release Order

1. Apply the committed SQL migrations using `npm run db:migrate` with the intended
   backend database configuration. This release adds `0025_profile_fuel_provenance`
   and `0026_support`; do not start the new backend against the old schema.
2. Push the prepared source changes and wait for the backend and frontend builds.
3. Sign in with the explicitly authorized administrator account. The sidebar
   contains Support for every signed-in user and Admin Panel only for accounts
   allowed by the backend.
4. Send a disposable support ticket from a test account. Confirm that it appears
   in the admin queue, the administrator receives its Telegram notification, and
   a reply appears in the originating account. Then resolve the ticket.

No new AI keys, paid inference, VIN lookups or document uploads are needed.

## Backend Configuration

```dotenv
SUPPORT_ADMIN_USER_IDS=
SUPPORT_NOTIFICATIONS_ENABLED=false
SUPPORT_TELEGRAM_CHAT_ID=
```

`SUPPORT_ADMIN_USER_IDS` is a comma-separated allowlist of immutable account UUIDs,
not email addresses, phone numbers or Telegram usernames. An empty list denies
all administrative access. The server checks it both in the HTTP guard and in
administrative service methods. Registration and JWT role/email claims cannot
grant this permission. Remove an ID to revoke access on the next configuration
deployment; old JWTs do not bypass the allowlist.

When notifications are enabled, the existing `TELEGRAM_BOT_TOKEN` is used. By
default, notifications go to the allowlisted administrators' linked Telegram
accounts. A deliberate `SUPPORT_TELEGRAM_CHAT_ID` override is optional. Do not
put any of these settings in a `VITE_` variable.

The approved production account ID and notification opt-in were saved on Render
using **Save only**. This is configuration preparation, not publication of this
code or application of the migrations. Secret values were not revealed or changed.

## User Journey

Support works without a vehicle. A user can optionally attach an owned vehicle,
choose a category, create a ticket and continue its conversation. The user sees
only their tickets; guessing another ticket or vehicle UUID does not expose it.

The admin queue supports subject search, status filtering and pagination.
Administrative replies move new tickets into progress. Administrators can set
open, in-progress or resolved status. A new user reply reopens a resolved ticket.
The inbox and selected conversation refresh every 30 seconds while visible;
manual refresh is also available. Drafts remain after a failed submission.
Ukrainian, Polish and English labels are included. Mobile uses separate inbox
and conversation views with a back control, rather than a compressed split view.

Tickets, messages and notification jobs are committed together. Notification
failure cannot discard the user's ticket. Telegram receives only the event,
ticket UUID and an HTTPS link; it does not receive the subject, message, email,
VIN or vehicle details. The link opens the correct ticket after normal sign-in
and authorization. It is not an authentication token.

The persistent outbox uses leases, bounded batches, backoff and at most five
attempts. Successful recipients are remembered across retries. Delivery state is
visible in the admin conversation. A crash after Telegram accepts a message but
before persistence can produce a duplicate generic notice: delivery is
at-least-once, not an exactly-once promise. On a sleeping Render Free instance,
pending work resumes when the backend wakes; there is no always-on guarantee.

## Fuel Source Priority

The latest explicit owner correction has priority over VIN data, report
normalization and AI guesses. Provenance is stored for the fuel field itself;
confirming an unrelated profile field does not confirm inherited fuel data.
Version creation is serialized, so a report that completes after an owner edit
cannot overwrite the owner's confirmed fuel. Later explicit owner edits still
work normally.

The profile, external-report viewer and assistant show conflicting source
values. Original source reports and RAW payloads remain unchanged. Assistant
prompts distinguish a current correction from a completed save; website chat
still cannot claim to have saved a profile without its normal workflow.

Historical profile errors are not guessed away or bulk-rewritten. If an earlier
release already replaced the owner's fuel, confirm the correct fuel again in
the profile. Existing reports remain provider evidence, not owner confirmation.

## Verification

Final local run on 2026-11-14: **434/434 tests passed**, API TypeScript build
passed, frontend TypeScript/Vite build passed, and `git diff --check` passed.
Vite retains a non-blocking warning about the existing main bundle exceeding
500 kB. No commit, push or production migration was performed by the agent.

- Isolated PostgreSQL migrations, profile versions, VIN/report conflict fixtures,
  owner priority, late report completion and assistant context regression tests.
- Real JWT HTTP tests for support authentication, ownership, admin permission,
  forged fields, validation, persistence and status transitions.
- Mocked Telegram transport tests for payload privacy, rate limits, outages,
  retries, leases, crash recovery, disabled workers and partial recipient delivery.
- Browser-to-Nest-to-isolated-PostgreSQL check: create a ticket, reload, switch to
  admin, reply, resolve, switch back, read the reply and reopen with a user message.
- Desktop and 390px responsive screenshots; document width does not exceed the
  viewport. No live Telegram notification or production ticket was sent.

The browser fixture lives in ignored `scratch/` and uses synthetic credentials,
an in-memory database and disabled Telegram. It never connects to production.
