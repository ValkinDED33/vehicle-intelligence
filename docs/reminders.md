# Dated Telegram reminders

Reminders are shared between the website's Reminders page and the linked
Telegram account. Natural-language creation, edits, completion and cancellation
require confirmation. `/reminders` lists active reminders for the selected car
without an AI call. Inspection dates are personal records, not calculated legal
deadlines or a manufacturer service schedule.

For example, `10\11-27` means **10 November 2027** (day-month-year). If no notice
periods/time/zone were given, the confirmation offers one calendar month and one
week before at 09:00 Europe/Warsaw. The resulting dates are 10 October and
3 November. A missing year is not inferred. Users can choose 1-10 notice periods
in days, weeks or calendar months, including zero days (the event date), and a
notification time/IANA time zone. Calendar-month arithmetic clamps the day at
month end; daylight-saving changes preserve local time. Nonexistent or ambiguous
local times are rejected instead of silently shifting them. The date has no
appointment time: `remindAt` is the notification time only.

The preview lists only future notification times. An entirely elapsed schedule
is rejected. Editing creates a new revision and cancels pending notices from
the old revision. Completion/cancellation stops pending notices but cannot recall
a message already in flight. Archived vehicles never receive notices.
Website edits/status changes include `expectedRevision`; stale requests return
409 rather than overwriting another channel's update. Telegram confirmations
are bound server-side to the reminder revision and show its title/event date.

## Deployment

1. Run `npm test` and build the API/frontend.
2. Apply migration `0019_scheduled_reminders` with `npm run db:migrate` using
   the deployment database, then deploy the updated API and frontend.
3. Configure the production process with `REMINDERS_WORKER_ENABLED=true` and
   the existing `TELEGRAM_BOT_TOKEN`. Leave the worker disabled on previews and
   local processes connected to the production DB. No new AI key is required.
4. Keep the backend running continuously, or configure an external scheduler
   to call the endpoint below every 1-5 minutes. The in-process worker checks
   once at startup and every minute while the process is awake. It cannot wake
   a sleeping service by itself. Render Free services sleep after 15 minutes
   without inbound traffic: https://render.com/docs/free#spinning-down-on-idle.
5. For external scheduling, configure a random `REMINDERS_CRON_SECRET` of at
   least 32 characters. Send `POST /internal/reminders/dispatch` with header
   `Authorization: Bearer <REMINDERS_CRON_SECRET>`. Store the secret in the
   scheduler's secret/header configuration, never in a URL. An unconfigured or
   disabled worker returns 503; missing/incorrect authorization returns 401.
6. Ensure the user has started/unblocked the bot and linked the correct website
   account. The website shows missing-link/disabled-delivery warnings. Correct
   backend initialization must register `message` and `callback_query` updates;
   `node scripts/check-telegram-deploy.cjs` checks this without changing Telegram.

Delivery precision depends on scheduler frequency, server startup time and
Telegram availability; this is not an exact-to-the-second delivery guarantee.
Do not set up a paid hosting or scheduling plan without the owner's approval.

## Delivery behavior

- Schedules and delivery results are stored in PostgreSQL, not process timers.
- Database row locks and claim tokens coordinate multiple worker instances.
- Up to 20 notices are processed per dispatch; subsequent ticks handle backlog.
- After downtime, older due notices for one event are marked skipped and only
  the latest due notice is sent. After the day following the event, pending
  notices expire instead of sending stale reminders indefinitely.
- Missing Telegram linkage waits for reconnection without sending. Blocking,
  unavailable chats, explicit rate limits and uncertain results are stored.
- Explicit Telegram 429/5xx rejections retry with a bounded delay, at most five
  sending attempts. Network timeouts/invalid responses are uncertain: Telegram
  may already have accepted the message, so they are not automatically resent.
- A sending claim interrupted for ten minutes becomes uncertain, not pending.
  This favors avoiding duplicate notifications over pretending exactly-once
  delivery is possible across PostgreSQL and Telegram.
- Notification copy follows the account's Ukrainian, Polish or English setting.
  User-entered event names are preserved. Reminder text is generated locally;
  sending scheduled notices does not consume AI quota.

The browser lists each planned/sent/failed/unconfirmed delivery. Review an
uncertain result before intentionally scheduling another notice. No production
migration, worker activation or real Telegram send is part of the local tests.
