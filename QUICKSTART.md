# Stasis — как запустить приложение

Три пути, от быстрого к боевому. Все команды — из корня репозитория. Node **24** обязателен
(`node --version` → v24.x): без него не работает `node:sqlite`.

Секреты берутся из `.env` (в `.gitignore`). Он уже есть с `BOT_TOKEN`/`JWT_SECRET`/`DATA_ENC_KEY`.
Сервер сам `.env` НЕ читает — его либо инжектит `docker compose` (Путь C), либо мы передаём
флагом `node --env-file=.env` (Пути A/B).

Сгенерировать секрет, где нужно: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

---

## Путь A — локальный смоук (1 минута, без Telegram)

Проверить, что всё собирается и сервер поднимается. Полный флоу в браузере НЕ пройдёт:
`/auth` принимает только подписанную Telegram initData (проверка HMAC), а её без Telegram нет.
Годится, чтобы увидеть `/health` и что API живой.

```powershell
pnpm install
pnpm -r build
node --env-file=.env apps/server/dist/main.js
```

В другом окне:
```powershell
curl http://localhost:3000/health      # → {"ok":true,"region":"ru",...}
```
`Ctrl+C` — остановить.

---

## Путь B — реальный Telegram через туннель (рекомендую для теста сейчас, ~10 мин, без VM)

Тот же единый origin, что и в проде, только HTTPS даёт туннель с вашей машины. URL туннеля
временный (меняется при каждом запуске) — для тест-сессий ок, для стабильного пилота см. Путь C.

**1. Собрать Mini App** (запекаем ссылки на статичные страницы того же origin):
```powershell
$env:VITE_POLICY_URL="/policy.html"; $env:VITE_OFFER_URL="/offer.html"
pnpm install
pnpm -r build
```

**2. Поднять туннель на порт 3000** (нужен `cloudflared`: `winget install --id Cloudflare.cloudflared`):
```powershell
cloudflared tunnel --url http://localhost:3000
```
Скопировать выданный `https://<случайное>.trycloudflare.com`. Окно НЕ закрывать.
(Альтернатива: `ngrok http 3000`.)

**3. Дописать в `.env`** недостающие ключи (подставить URL туннеля и имя бота):
```
MINIAPP_URL=https://<туннель>.trycloudflare.com
PUBLIC_BASE_URL=https://<туннель>.trycloudflare.com
WEBHOOK_SECRET=<node -e "...randomBytes(32)...">
TG_SHARE_BASE_URL=https://t.me/<имя_бота>
MINIAPP_DIST=C:\Users\79126\Documents\CLAUD\Stasis\apps\miniapp\dist
REGION=ru
```

**4. Запустить сервер** (сам зарегистрирует webhook на URL туннеля):
```powershell
node --env-file=.env apps/server/dist/main.js
```
В логах: `stasis server on :3000` и `telegram webhook registered`.

**5. Открыть в Telegram:** найти своего бота → `/start` → кнопка «Пройти диагностику»
открывает Mini App. Пройти: согласия → колесо → тесты → результат.

Опционально (для меню-кнопки и share-диплинков `t.me/<bot>?startapp=`): в **@BotFather** →
Bot Settings → Menu Button → URL туннеля; и создать Mini App (`/newapp`). Для флоу из `/start`
это не обязательно — inline web_app работает с любым HTTPS.

При новом запуске туннель даёт другой URL → обновить 3 ключа в `.env` и перезапустить сервер.

---

## Путь C — боевой деплой на VM (Yandex Cloud, для пилота)

Стабильный домен + Docker Compose (один процесс + Caddy авто-HTTPS). Полный runbook и
пред-деплой чек-лист: [docs/deploy/yandex-cloud.md](docs/deploy/yandex-cloud.md).

**Что нужно заранее (не автоматизируется):** аккаунт Yandex Cloud + биллинг; домен + DNS
A-запись на IP VM; VM в `ru-central1` (Ubuntu, порты 80/443); Docker + docker compose на VM;
утверждённые юристом `policy.html`/`offer.html`.

**На VM:**
```bash
git clone https://github.com/khrapovitskiyivan-lgtm/Stasis.git && cd Stasis
cp .env.example .env && nano .env     # заполнить BOT_TOKEN, JWT_SECRET, DATA_ENC_KEY (64 hex),
                                      # DOMAIN, PUBLIC_BASE_URL, MINIAPP_URL, WEBHOOK_SECRET,
                                      # TG_SHARE_BASE_URL, REGION=ru, DATABASE_PATH=/app/data/stasis.sqlite
mkdir -p data
DOMAIN=<домен> docker compose up -d --build
docker compose logs -f app            # дождаться "stasis server on :3000"
curl https://<домен>/health           # → {"ok":true,"region":"ru"}
```
Затем в **@BotFather** задать домен/Menu Button на `https://<домен>` и пройти флоу в Telegram.

---

## Частые грабли

- **`BOT_TOKEN is required` / `DATA_ENC_KEY must be 32 bytes hex`** — не передан `.env`
  (забыли `--env-file`) или ключ не 64 hex-символа.
- **`WEBHOOK_SECRET is required when PUBLIC_BASE_URL is set`** — задан публичный URL без секрета:
  добавить `WEBHOOK_SECRET` в `.env`.
- **Mini App не открывается из браузера** — так и задумано: нужен Telegram (Путь B/C).
- **Node не 24** — `node:sqlite` не заработает; поставить Node 24.
- **«Квадраты» вместо кириллицы на share-картинке** — только вне Docker; в образе шрифты Noto уже стоят.
