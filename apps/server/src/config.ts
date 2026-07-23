import { REGIONS, type Region } from './regions.js';

export function loadConfig() {
  const { BOT_TOKEN, JWT_SECRET, DATABASE_PATH, PORT, DATA_ENC_KEY, WEBHOOK_SECRET, MINIAPP_URL, PUBLIC_BASE_URL, TG_SHARE_BASE_URL, REGION } = process.env;
  if (!BOT_TOKEN) throw new Error('BOT_TOKEN is required');
  if (!JWT_SECRET) throw new Error('JWT_SECRET is required');
  if (!DATA_ENC_KEY) throw new Error('DATA_ENC_KEY is required');
  // Fail fast at startup rather than 500-ing on the first /submit with a bad key.
  if (!/^[0-9a-fA-F]{64}$/.test(DATA_ENC_KEY)) throw new Error('DATA_ENC_KEY must be 32 bytes hex (64 chars)');
  // A public webhook MUST have a secret — otherwise a forged update could invoke
  // privileged bot commands (e.g. /delete_my_data) for any tg id. Refuse to boot.
  if (PUBLIC_BASE_URL && !WEBHOOK_SECRET) throw new Error('WEBHOOK_SECRET is required when PUBLIC_BASE_URL is set');
  const region = (REGION ?? 'ru') as Region;
  // Fail fast at startup on a typo'd/unsupported region rather than serving
  // wrong crisis-support copy or data-residency claims at runtime.
  if (!(region in REGIONS)) throw new Error('unknown region: ' + region);
  return {
    region,
    botToken: BOT_TOKEN,
    jwtSecret: JWT_SECRET,
    dbPath: DATABASE_PATH ?? './data/stasis.sqlite',
    port: Number(PORT ?? 3000),
    encKey: DATA_ENC_KEY,
    // All optional: the bot side (webhook + Mini App button) is only wired up
    // when these are present, so a bare BOT_TOKEN keeps working in dev.
    webhookSecret: WEBHOOK_SECRET,
    miniappUrl: MINIAPP_URL,
    publicBaseUrl: PUBLIC_BASE_URL,
    // Telegram deep-link base for share links, e.g. https://t.me/<bot> (or
    // https://t.me/<bot>/<app>). Distinct from PUBLIC_BASE_URL (the API origin).
    tgShareBaseUrl: TG_SHARE_BASE_URL,
  };
}
