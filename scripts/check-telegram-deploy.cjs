const fs = require('node:fs');
const { Client } = require('pg');
const env = { ...(fs.existsSync('.env') ? require('dotenv').parse(fs.readFileSync('.env')) : {}), ...process.env };

(async () => {
  const journal = JSON.parse(fs.readFileSync('drizzle/meta/_journal.json'));
  for (const entry of journal.entries) {
    if (!fs.existsSync(`drizzle/${entry.tag}.sql`)) throw new Error('Migration file missing: ' + entry.tag);
  }
  console.log('Migration journal: all SQL files present');
  const url = new URL(env.DATABASE_URL);
  if (['prefer', 'require', 'verify-ca'].includes(url.searchParams.get('sslmode'))) url.searchParams.set('sslmode', 'verify-full');
  const client = new Client({ connectionString: url.toString(), connectionTimeoutMillis: 10000 });
  try {
    await client.connect();
    await client.query('BEGIN READ ONLY');
    const result = await client.query(`SELECT
      to_regclass('public.telegram_conversations') IS NOT NULL AS conversations,
      to_regclass('public.telegram_links') IS NOT NULL AS links,
      EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='telegram_id') AS identity`);
    console.log('Database schema:', JSON.stringify(result.rows[0]));
    const tracking = await client.query(`SELECT
      to_regclass('drizzle.__drizzle_migrations') IS NOT NULL AS drizzle,
      to_regclass('public.__drizzle_migrations') IS NOT NULL AS public`);
    const ledger = tracking.rows[0].drizzle ? 'drizzle' : tracking.rows[0].public ? 'public' : null;
    if (ledger) {
      const applied = await client.query(ledger === 'drizzle'
        ? 'SELECT created_at FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 1'
        : 'SELECT created_at FROM public.__drizzle_migrations ORDER BY created_at DESC LIMIT 1');
      const last = Number(applied.rows[0]?.created_at ?? 0);
      const known = journal.entries.find(entry => entry.when === last);
      console.log('Migration tracking:', JSON.stringify({ lastApplied: known?.tag ?? (last ? 'unknown migration' : 'empty ledger'), pending: journal.entries.filter(entry => entry.when > last).map(entry => entry.tag) }));
      if (!known) process.exitCode = 1;
    } else {
      console.log('Migration tracking: missing; review the existing database baseline before running migrations');
      process.exitCode = 1;
    }
    await client.query('ROLLBACK');
    if (!Object.values(result.rows[0]).every(Boolean)) process.exitCode = 1;
  } catch (error) {
    console.log('Database check failed:', error.code || error.name); process.exitCode = 1;
  } finally { await client.end().catch(() => {}); }
  for (const method of ['getMe', 'getWebhookInfo']) {
    try {
      const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, { signal: AbortSignal.timeout(12000) });
      const body = await response.json();
      if (!body.ok) { console.log(method + ': HTTP ' + response.status); process.exitCode = 1; continue; }
      const value = body.result;
      console.log(method === 'getMe' ? `Bot: @${value.username}` : JSON.stringify({
        webhookConfigured: !!value.url, pendingUpdates: value.pending_update_count,
        callbackQueriesEnabled: value.allowed_updates?.includes('callback_query') ?? true,
        hasDeliveryError: !!value.last_error_message,
      }));
      if (method === 'getWebhookInfo' && (!value.url || value.allowed_updates && !value.allowed_updates.includes('callback_query') || value.last_error_message)) process.exitCode = 1;
    } catch (error) { console.log(method + ' failed: ' + error.name); process.exitCode = 1; }
  }
})().catch(error => { console.log('Readiness check failed: ' + error.name); process.exitCode = 1; });
