import { loadConfig } from './config.js';
import { openDb } from './db/connection.js';
import { buildApp } from './app.js';

const cfg = loadConfig();
const app = buildApp({ db: openDb(cfg.dbPath), botToken: cfg.botToken, jwtSecret: cfg.jwtSecret });
app.listen({ port: cfg.port, host: '0.0.0.0' }).then(() => {
  console.log(`stasis server on :${cfg.port}`);
});
