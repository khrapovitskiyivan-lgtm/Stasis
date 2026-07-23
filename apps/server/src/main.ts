import { loadConfig } from './config.js';
import { openDb } from './db/connection.js';
import { buildApp } from './app.js';
import { loadContent } from './content/loader.js';

const cfg = loadConfig();
const content = loadContent(process.cwd());
const app = buildApp({ db: openDb(cfg.dbPath), botToken: cfg.botToken, jwtSecret: cfg.jwtSecret, encKey: cfg.encKey, content });
app.listen({ port: cfg.port, host: '0.0.0.0' }).then(() => {
  console.log(`stasis server on :${cfg.port}`);
});
