export function loadConfig() {
  const { BOT_TOKEN, JWT_SECRET, DATABASE_PATH, PORT, DATA_ENC_KEY, WEBHOOK_SECRET, MINIAPP_URL, PUBLIC_BASE_URL } = process.env;
  if (!BOT_TOKEN) throw new Error('BOT_TOKEN is required');
  if (!JWT_SECRET) throw new Error('JWT_SECRET is required');
  if (!DATA_ENC_KEY) throw new Error('DATA_ENC_KEY is required');
  // Fail fast at startup rather than 500-ing on the first /submit with a bad key.
  if (!/^[0-9a-fA-F]{64}$/.test(DATA_ENC_KEY)) throw new Error('DATA_ENC_KEY must be 32 bytes hex (64 chars)');
  return {
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
  };
}
