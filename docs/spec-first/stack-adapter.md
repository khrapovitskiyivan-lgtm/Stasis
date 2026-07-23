# Stack adapter — Stasis (Spec-First v2 §2)

The 6 spec blocks are stack-independent. This adapter translates the **Data**, **Interface**, **Background**, and **Security** blocks into our concrete stack (Telegram Mini App + Node/Fastify + node:sqlite + grammY). Not Supabase/Next — the methodology's default table does not apply.

| Spec block | Generic | Stasis concretion |
|------------|---------|-------------------|
| **Data model** | entities + constraints | `node:sqlite` tables via a migrations module; access ONLY through repository functions (`usersRepo`, later `testRunsRepo`, `profilesRepo`, `sharesRepo`, `followUpsRepo`). Row↔domain mapping in the repo; `Db` type = `InstanceType<typeof DatabaseSync>`, kept out of route/service code for Postgres portability. Sensitive raw fields (answers, wheel scores) AES-256-GCM encrypted at rest (Phase 2). |
| **Interface (API)** | function/endpoint contracts | Fastify v4 routes: method, path, `Authorization` scheme (`tma <initData>` / `Bearer <jwt>`), request/response validated by `@stasis/shared` zod schemas, explicit status codes (200 / 401 / 500). No client-trusted identity. |
| **Client↔server contract** | shared types | `packages/shared` zod schemas are the single source; both Mini App and server import them. Never hand-duplicate a shape. |
| **Background / cron** | scheduled work | Follow-up: a `follow_ups` table + a lightweight periodic worker polling `due_at` (no external queue in MVP). Idempotent sends; respects unsubscribe. OG-image generation off the event loop (resvg/sharp) with disk cache. |
| **ML / scoring inference** | model service | No ML in MVP. Scoring = pure deterministic TS functions (`computeMiniInsight`, `computeProfile`) with golden tests. The "pilot" validates the *instrument*, not a served model. |
| **Security** | authz + data protection | `initData` HMAC validation (готовая либа) + `auth_date` ≤ 3h; HS256 JWT (pinned) session; webhook `secret_token` header check (Phase 4); secrets from env; RU hosting + 152-ФЗ localization; three-tier data privacy (raw encrypted → profile refs → public payload without PII). |
| **Runtime specifics** | — | ESM + `.js` import suffixes; `node:sqlite` loaded via `createRequire`; PRAGMA via `db.exec`; pnpm workspaces; Vitest. |

**Principle:** apply the 6-block discipline to every module; extend this table when a genuinely new stack element appears (e.g. React/Vite specifics when Phase 3 UI starts).
