export function loadConfig() {
  const { BOT_TOKEN, JWT_SECRET, DATABASE_PATH, PORT } = process.env;
  if (!BOT_TOKEN) throw new Error('BOT_TOKEN is required');
  if (!JWT_SECRET) throw new Error('JWT_SECRET is required');
  return {
    botToken: BOT_TOKEN,
    jwtSecret: JWT_SECRET,
    dbPath: DATABASE_PATH ?? './data/stasis.sqlite',
    port: Number(PORT ?? 3000),
  };
}
