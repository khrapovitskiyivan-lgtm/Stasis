# Деплой в Yandex Cloud (РФ-хостинг, 152-ФЗ)

> **Статус: черновик.** Адаптирован из шаблона `di-sukharev/vibe` (`docs/YANDEX_CLOUD.md`)
> под реальную архитектуру Stasis. Это НЕ дословная копия — стек другой
> (node:sqlite, Fastify + grammY, webhook, initData-auth, pnpm), поэтому serverless-путь
> vibe заменён на путь, совместимый с файловой SQLite.
>
> **Почему именно Yandex Cloud:** 152-ФЗ требует хранить и обрабатывать ПД
> граждан РФ на территории РФ. Vibe по умолчанию деплоит в DigitalOcean — нам это
> не подходит. Все ресурсы ниже создаются в `ru-central1`.

## Ключевое расхождение с шаблоном vibe

Vibe кладёт бэкенд в **Yandex Serverless Container** (эфемерная ФС, Managed PostgreSQL
как БД). Stasis сейчас использует `node:sqlite` (`DatabaseSync`) — файл `./data/stasis.sqlite`
с WAL. Файловой SQLite нужен **постоянный записываемый диск**; в serverless-контейнере
файл не переживёт рестарт/масштабирование. Отсюда две опции:

| | **Опция A — Compute VM (рекомендация для MVP/пилота)** | **Опция B — Serverless + Managed PostgreSQL** |
|---|---|---|
| Бэкенд | один процесс на VM (bot + backend), как в CLAUDE.md | Serverless Container из образа |
| БД | node:sqlite на SSD-диске VM | миграция на Managed PostgreSQL 16+ |
| Когда | сейчас: один процесс, webhook, малый трафик пилота | при горизонтальном масштабировании |
| Стоимость | ~1 маленькая VM + диск | контейнер + Managed PG (дороже) |
| Портируемость | репо-слой (`db/*.repo.ts`) уже написан под Postgres-переносимость — переход возможен без переписывания вызовов | — |

**Для инструментированного soft-launch берём Опцию A.** Опция B — задокументированный
путь роста, не делаем до появления реальной причины масштабироваться.

## Карта сервисов (Опция A)

- **Мини-приложение** (`apps/miniapp`, `vite build` → `dist/`) → **Object Storage** static
  website hosting + **Cloud CDN**, кастомный домен `app.<домен>`. Отдаётся внутри Telegram WebView.
- **Сервер** (`apps/server`, Fastify + grammY, один процесс) → **Compute Cloud VM**
  (напр. 2 vCPU / 2 ГБ) с постоянным SSD-диском под `DATABASE_PATH`.
- **Публичный HTTPS для сервера** (нужен и для Telegram-webhook, и для API мини-аппа):
  TLS-терминация на VM (Caddy/nginx) с сертификатом **Certificate Manager**, ИЛИ
  **API Gateway** перед приватной VM. Домен `api.<домен>`.
- **Секреты** (`BOT_TOKEN`, `JWT_SECRET`, `DATA_ENC_KEY`) → **Yandex Lockbox**, инъекция в env.
- **Бэкапы SQLite** → регулярный снапшот диска VM + периодический `.backup` в Object Storage.
- **CLI**: `yc` (Yandex Cloud CLI).

## Предусловия (частично ещё не в коде — сделать до деплоя)

- [ ] **Health-эндпоинты** `/health/live` и `/health/ready` в `apps/server/src/app.ts` —
      **сейчас их нет**, нужны для проверки живости за ingress. (Добавить в Phase 4.)
- [ ] **Webhook-роут grammY** (`POST /webhook/<секрет>`) — Phase 4, ещё не реализован.
      Telegram требует валидный TLS и порт из {443, 80, 88, 8443}.
- [ ] Аккаунт Yandex Cloud с биллингом; выбраны cloud и folder.
- [ ] Домены и доступ к DNS для `app.<домен>` и `api.<домен>`.
- [ ] Сертификат в Certificate Manager для публичного домена сервера.
- [ ] Docker локально, если образ сервера собирается на этой машине.
- [ ] AWS CLI (Object Storage — S3-совместимый) для заливки статики мини-аппа.
- [ ] `jq` для парсинга `yc --format json` в сниппетах ниже.

Установка и инициализация CLI:

```bash
curl -sSL https://storage.yandexcloud.net/yandexcloud-yc/install.sh | bash
yc init
yc config list
# при смене folder: yc config set folder-id <folder_ID>
```

## Секреты и env сервера

Реальный контракт из `apps/server/src/config.ts` (fail-fast на старте):

```bash
BOT_TOKEN=<токен бота от @BotFather>
JWT_SECRET=<длинная случайная строка>
DATA_ENC_KEY=<ровно 32 байта hex = 64 hex-символа>   # openssl rand -hex 32
DATABASE_PATH=/mnt/data/stasis.sqlite                 # постоянный диск, НЕ /tmp
PORT=3000
```

- `DATA_ENC_KEY` шифрует ПД на уровне полей (`apps/server/src/crypto/field.ts`) — это часть
  152-ФЗ-контура; потеря ключа = потеря данных, менять только с ре-шифрованием.
- `JWT_SECRET` генерировать `openssl rand -hex 32`; НЕ плейсхолдер из `.env.example`.
- Хранить всё в **Lockbox**, а не в shell-истории и не в git (`.env` уже в `.gitignore`).

## Сервер на Compute VM (Опция A)

1. Создать VM в `ru-central1` с образом Ubuntu LTS, установить Node ≥ 20 и pnpm
   (`npm i -g pnpm`). Примонтировать отдельный SSD под `/mnt/data` (переживает пересоздание VM).
2. Выкатить код, собрать:
   ```bash
   pnpm install
   pnpm -r build
   ```
3. Прогнать миграции БД на постоянный диск (репо использует `db/migrate.ts`):
   ```bash
   DATABASE_PATH=/mnt/data/stasis.sqlite node apps/server/dist/db/migrate.js
   ```
4. Запустить процесс под systemd (env из Lockbox), бинд `0.0.0.0:$PORT`
   (как в `apps/server/src/main.ts`).
5. Перед процессом — Caddy/nginx с сертификатом Certificate Manager, проксирование
   `api.<домен>` → `127.0.0.1:$PORT`.
6. Зарегистрировать Telegram-webhook на `https://api.<домен>/webhook/<секрет>`
   (после реализации роута в Phase 4).

**Никогда** не выставляй порт сервера напрямую без TLS: и мини-апп, и Telegram
требуют HTTPS.

## Статика мини-аппа → Object Storage + CDN

```bash
# API-хост встраивается в бандл на этапе сборки:
VITE_API_URL=https://api.<домен> pnpm --filter @stasis/miniapp build
```

Залить `apps/miniapp/dist/` в публичный бакет и включить static website hosting
(`index.html` как index И как error-document — иначе refresh на клиентском роуте отдаёт 404):

```bash
aws configure   # region: ru-central1, ключи static access key сервис-аккаунта
aws --endpoint-url=https://storage.yandexcloud.net/ s3 cp --recursive \
  apps/miniapp/dist/ s3://<miniapp-bucket>/
```

Перед статикой — Cloud CDN с кастомным доменом `app.<домен>`, CNAME на CDN-балансировщик
(не ANAME). Хешированные ассеты — длинный кэш; `index.html` — короткий, чтобы релизы
раскатывались быстро. **В статику мини-аппа не класть секреты** — бакет публичный.

## 152-ФЗ / приватность (обязательное)

- Все ресурсы (VM, диск, Object Storage, CDN) — в `ru-central1`.
- ПД шифруются на уровне полей (`DATA_ENC_KEY`) до записи в SQLite.
- В имена бакетов, ключи объектов, метаданные, теги — никаких ПД, id пользователей, e-mail.
- Два явных согласия (ПД + психосостояние) + 18+ собираются в мини-аппе до теста
  (см. CLAUDE.md, «Legal / safety»); хранение согласий — в БД на VM в РФ.
- Приватные файлы (если появятся) — только через backend-проверку прав + presigned URL.

## Валидация после деплоя

Локально до облака (реальные скрипты Stasis):

```bash
pnpm typecheck
pnpm test
pnpm build
```

После деплоя:

- [ ] `/health/live` и `/health/ready` через `https://api.<домен>` (когда добавлены);
- [ ] `POST /auth` с `Authorization: tma <initData>` из реального Telegram отдаёт токен;
- [ ] `/me` и `/submit` с `Bearer <token>` работают; неверный токен → 401;
- [ ] статика мини-аппа грузится с `app.<домен>`, refresh на роуте не даёт 404;
- [ ] Telegram-webhook принимает апдейты (Phase 4);
- [ ] SQLite-бэкап реально создаётся по расписанию и восстанавливается;
- [ ] данные записываются на постоянный диск и переживают рестарт VM.

## Путь роста (Опция B — Serverless + Managed PostgreSQL)

Когда понадобится масштабирование за один инстанс: мигрировать репо-слой
(`apps/server/src/db/*.repo.ts`, уже написан переносимо) на Managed PostgreSQL 16+,
собрать образ сервера, выкатить в Serverless Container за API Gateway.
До этого момента — **не усложнять**: один процесс + node:sqlite покрывает пилот.

## Ссылки

- CLI: https://yandex.cloud/ru/docs/cli/quickstart
- Compute Cloud: https://yandex.cloud/ru/docs/compute/
- Object Storage static hosting: https://yandex.cloud/ru/docs/storage/operations/hosting/setup
- Object Storage + AWS CLI: https://yandex.cloud/ru/docs/storage/tools/aws-cli
- Cloud CDN: https://yandex.cloud/ru/docs/cdn/concepts/
- Certificate Manager: https://yandex.cloud/ru/docs/certificate-manager/
- Lockbox: https://yandex.cloud/ru/docs/lockbox/
- Managed PostgreSQL (Опция B): https://yandex.cloud/ru/docs/managed-postgresql/
- API Gateway (Опция B): https://yandex.cloud/ru/docs/api-gateway/
