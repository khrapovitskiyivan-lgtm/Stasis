import { loadConfig } from './config.js';
import { openDb } from './db/connection.js';
import { buildApp } from './app.js';
import { loadContent } from './content/loader.js';
import { buildBot } from './bot/bot.js';
import { startScheduler } from './followup/scheduler.js';

const cfg = loadConfig();
const content = loadContent(process.cwd());
const db = openDb(cfg.dbPath);

// Bot side is optional: only wire it up once a token and Mini App URL exist.
const bot = cfg.botToken && cfg.miniappUrl ? buildBot({ botToken: cfg.botToken, miniappUrl: cfg.miniappUrl, db }) : undefined;

// Follow-up nudges only make sense once the bot can actually message users.
if (bot) startScheduler(db, cfg.encKey, bot);

const app = buildApp({
  db,
  botToken: cfg.botToken,
  jwtSecret: cfg.jwtSecret,
  encKey: cfg.encKey,
  content,
  bot,
  webhookSecret: cfg.webhookSecret,
  publicBaseUrl: cfg.publicBaseUrl,
});

app.listen({ port: cfg.port, host: '0.0.0.0' }).then(async () => {
  console.log(`stasis server on :${cfg.port}`);
  // Registering the real webhook needs a public HTTPS URL, so it's skipped
  // entirely in dev where PUBLIC_BASE_URL is unset.
  if (bot && cfg.publicBaseUrl) {
    try {
      await bot.api.setWebhook(`${cfg.publicBaseUrl}/webhook`, { secret_token: cfg.webhookSecret });
      console.log('telegram webhook registered');
    } catch (e) {
      console.error('failed to register telegram webhook', e instanceof Error ? e.message : e);
    }
  }
});
