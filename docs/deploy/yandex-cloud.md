# Деплой в Yandex Cloud (РФ-хостинг, 152-ФЗ)

> **Статус: рабочий runbook.** Обновлён под реально собранную архитектуру после Phase 4/5.
> Health, webhook, миграции, отдача Mini App с одного origin, Docker/Caddy — уже в коде.
>
> **Почему Yandex Cloud:** 152-ФЗ требует хранить и обрабатывать ПД граждан РФ на территории РФ.
> Все ресурсы создаются в `ru-central1`.

## Архитектура (Опция A — Compute VM, для MVP/пилота)

Один Node-процесс на VM обслуживает **всё с одного домена**:
- **API** (`/auth`, `/submit`, `/assessment`, `/signal`, `/consent`, `/share`, `/followup`, `/webhook`, `/health`),
- **Mini App** (Fastify отдаёт `apps/miniapp/dist` — Phase 5, `@fastify/static` + SPA-fallback),
- **бот** (grammY поверх webhook, проверка `secret_token`).

Перед процессом — **Caddy** (авто-HTTPS через Let's Encrypt). `node:sqlite` — файл на постоянном SSD-диске VM.
Запуск — **Docker Compose** (`app` + `caddy`). Один домен, один TLS-сертификат, никакого отдельного
Object Storage/CDN для MVP (Mini App отдаётся тем же сервером).

| | **Опция A — Compute VM (сейчас)** | **Опция B — Serverless + Managed PG (рост)** |
|---|---|---|
| Бэкенд | один процесс на VM (bot + API + Mini App) | Serverless Container из образа |
| БД | node:sqlite на SSD-диске VM | Managed PostgreSQL 16+ |
| Когда | пилот, малый трафик | горизонтальное масштабирование |
| Портируемость | репо-слой `db/*.repo.ts` уже под Postgres-переносимость | — |

**Node 24** обязателен на образе (у нас `node:24` в Dockerfile): `node:sqlite` доступен без флага
только с Node 24. Node 20 — НЕ подойдёт.

## Что должны сделать вы (не автоматизируется кодом)

- [ ] Аккаунт **Yandex Cloud** с биллингом; выбраны cloud и folder.
- [ ] **Домен** + доступ к DNS. Заведите A-запись `<домен>` → внешний IP VM. (Telegram web_app требует HTTPS с доменом — сырой IP не подойдёт.)
- [ ] **Compute VM** в `ru-central1` (Ubuntu LTS, 2 vCPU / 2 ГБ, отдельный SSD под данные), внешний IP, открытые порты **80 и 443**.
- [ ] **Docker + docker compose** на VM.
- [ ] Бот в **@BotFather**: включить Mini App / задать домен (`/setdomain` или Bot Settings → Mini App), кнопку меню на `https://<домен>`.
- [ ] **Юридическая проверка** черновиков `apps/miniapp/public/policy.html` и `offer.html`, заполнить реквизиты оператора.
- [ ] Подтвердить **реальный телефон доверия для взрослых** (в `apps/server/src/regions.ts` сейчас плейсхолдер).

## Env на VM (`.env` рядом с docker-compose.yml)

Контракт из `config.ts` (fail-fast на старте). Сгенерировать секреты: `openssl rand -hex 32`.

```bash
# Ядро
BOT_TOKEN=<токен от @BotFather>
JWT_SECRET=<openssl rand -hex 32>
DATA_ENC_KEY=<openssl rand -hex 32>   # ровно 64 hex-символа (32 байта)
REGION=ru
# Один домен для всего:
DOMAIN=<домен>                        # для Caddy (без https://)
PUBLIC_BASE_URL=https://<домен>       # API origin (для регистрации webhook)
MINIAPP_URL=https://<домен>           # кнопка web_app в боте открывает это
TG_SHARE_BASE_URL=https://t.me/<bot>  # база диплинка шеринга (t.me/бот), НЕ API-origin!
WEBHOOK_SECRET=<openssl rand -hex 32> # ОБЯЗАТЕЛЕН при PUBLIC_BASE_URL (иначе сервер не стартует)
# node:sqlite на постоянном диске (том ./data монтируется в контейнер):
DATABASE_PATH=/app/data/stasis.sqlite
```

- `DATA_ENC_KEY` шифрует ПД на уровне полей — потеря ключа = потеря данных; менять только с ре-шифрованием.
- `VITE_*` (API base, policy/offer) **запекаются в образ на билде** (см. Dockerfile) — в рантайм-env их дублировать не нужно. `VITE_API_BASE` намеренно пуст: Mini App и API на одном origin → относительные запросы.
- Секреты — только в `.env` на VM (в `.gitignore`) или в **Lockbox**; не в git, не в shell-истории.

## Запуск (Docker Compose)

```bash
# на VM, в каталоге с репо/Dockerfile/docker-compose.yml/Caddyfile
cp .env.example .env && nano .env     # заполнить значения выше
mkdir -p data                          # том для SQLite
DOMAIN=<домен> docker compose up -d --build
docker compose logs -f app             # проверить старт (fail-fast сообщит о плохом env)
```

Caddy сам получит TLS-сертификат Let's Encrypt для `<домен>` (нужны открытые 80/443 и корректная DNS-запись).
Миграции БД накатываются **автоматически при старте** (`connection.ts.openDb` → `runMigrations`), версии — в таблице `schema_version`.

## Регистрация webhook

`main.ts` сам регистрирует webhook при заданном `PUBLIC_BASE_URL`:
`setWebhook(https://<домен>/webhook, { secret_token: WEBHOOK_SECRET })` на старте.
Проверить: `curl https://<домен>/health` → `{"ok":true,"region":"ru",...}`.

## 152-ФЗ / приватность (обязательное)

- Все ресурсы (VM, диск) — в `ru-central1`. Данные не покидают РФ.
- ПД шифруются на уровне полей (`DATA_ENC_KEY`) до записи в SQLite; согласия (2 явных + 18+) пишутся на сервер.
- Никаких ПД в логах/тегах/именах. `/delete_my_data` — необратимое удаление всех данных пользователя.
- Политика конфиденциальности и Оферта должны быть реальными (не черновик) до сбора данных реальных пользователей.

## Пре-деплой блокеры (проверить перед первым запуском)

- [ ] **Шрифты OG-картинки** — в Dockerfile ставятся `fonts-noto-core` + `fonts-noto-color-emoji` (иначе «квадраты» на карточках шеринга). Проверить: `curl -s https://<домен>/share/<slug>/image.png -o /tmp/og.png && file /tmp/og.png`.
- [ ] **Node 24** на образе (node:sqlite). Уже в Dockerfile.
- [ ] Легал-страницы утверждены юристом; телефон доверия подтверждён.

## Валидация после деплоя

Локально до облака: `pnpm -r test` (135 тестов), `pnpm -r typecheck`, `pnpm -r build`.

После деплоя (реальный Telegram):
- [ ] `GET https://<домен>/health` → 200 `{ok:true, region}`;
- [ ] в боте `/start` → кнопка «Пройти диагностику» открывает Mini App;
- [ ] полный проход: согласия → колесо → тесты → результат;
- [ ] шеринг: кнопка «Поделиться» даёт ссылку `t.me/<bot>?startapp=<slug>`, превью-картинка рендерится с кириллицей;
- [ ] «Взять шаг в работу» → через ~3 дня приходит напоминание от бота;
- [ ] `/delete_my_data` удаляет данные; после — повторный вход работает (пользователь не заблокирован);
- [ ] данные переживают `docker compose restart app` (том `./data`).

## Бэкапы

Регулярный `.backup` SQLite-файла в Object Storage (РФ) + снапшот диска VM. Восстановление проверить заранее.

## Путь роста (Опция B)

При необходимости масштабирования за один инстанс: мигрировать репо-слой (`db/*.repo.ts`, уже переносим)
на Managed PostgreSQL 16+, собрать образ, выкатить в Serverless Container за API Gateway. До реальной причины — не усложнять.

## Ссылки

- CLI: https://yandex.cloud/ru/docs/cli/quickstart
- Compute Cloud: https://yandex.cloud/ru/docs/compute/
- Certificate Manager: https://yandex.cloud/ru/docs/certificate-manager/
- Lockbox: https://yandex.cloud/ru/docs/lockbox/
- Managed PostgreSQL (Опция B): https://yandex.cloud/ru/docs/managed-postgresql/
- Caddy авто-HTTPS: https://caddyserver.com/docs/automatic-https
