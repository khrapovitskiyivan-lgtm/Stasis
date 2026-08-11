# Return Loop (Companion Step 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A periodic, memory-anchored check-in + a deterministic "your dynamics" synthesis digest that turns the one-time diagnostic into a return loop.

**Architecture:** Reuse the existing follow-up nudge substrate (one scheduler, `follow_ups` table gains a `kind`). A new `checkins` data table captures each re-check-in (encrypted wheel/energy/note, plaintext outcome). A pure `computeDigest(history, now)` engine function selects observations (deterministic, golden-tested); a separate wording layer renders varied copy. The Mini App gets a light check-in flow + a digest screen. Built on the CURRENT onboarding.

**Tech Stack:** TypeScript (strict, ESM), Node 24, Fastify, grammY, `node:sqlite` (`DatabaseSync`) via repository layer, zod (`@stasis/shared`), React + Vite, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-26-return-loop-design.md`

## Global Constraints

- ESM everywhere; import siblings with an explicit `.js` extension.
- Engine functions are pure/deterministic (no DB/time/random); `now` is a parameter. Golden-tested. "Non-determinism only in wording, not in selection."
- All DB access through the repository layer. Field encryption via `crypto/field.ts` (AES-256-GCM, random IV → encrypted columns are NOT SQL-filterable/aggregatable).
- Encrypt `wheel_scores`, `energy`, `note`; keep `step_outcome` + all timestamps plaintext. The week-2 metric is timestamp-based only.
- Migrations are forward-only appends to `MIGRATIONS[]` in `apps/server/src/db/migrate.ts`; new version = 3; `CREATE TABLE IF NOT EXISTS`; columns via the v2 `ALTER` idiom.
- Deletion (152-ФЗ): every table with a `user_id` MUST be in `deletion.ts` `CHILD_TABLES`, and `checkins` MUST come BEFORE `follow_ups`.
- New user-facing copy must pass the forbidden-lexicon rule (no диагноз/лечени/терапи/гаранти/расстройств) and carry no clinical language.
- Run server tests: `pnpm --filter @stasis/server test`; miniapp: `pnpm --filter @stasis/miniapp test` (do NOT set `VITE_POLICY_URL`/`VITE_OFFER_URL` during tests). Rebuild shared after a schema change: `pnpm --filter @stasis/shared build`.
- Scope OUT: onboarding/belief-elicitation redesign (Spec #2), emergent tone-lens, timezone-aware timing, payments.

---

### Task 1: Migration v3 + deletion hardening + PDn-leak guard test

**Files:**
- Modify: `apps/server/src/db/migrate.ts` (append migration version 3)
- Modify: `apps/server/src/db/deletion.ts` (`CHILD_TABLES`)
- Test: `apps/server/src/db/migrate.test.ts`, `apps/server/src/db/deletion.test.ts`

**Interfaces:**
- Produces: table `checkins(id, user_id, created_at, wheel_scores, energy, step_ref, step_outcome, note)`; column `follow_ups.kind TEXT NOT NULL DEFAULT 'step'`; indexes `idx_checkins_user`, `idx_follow_ups_due`.
- Produces: `CHILD_TABLES` includes `'checkins'` before `'follow_ups'`.

- [ ] **Step 1: Write the failing guard test (deletion covers every user_id table)**

Add to `apps/server/src/db/deletion.test.ts`:
```ts
import { CHILD_TABLES } from './deletion.js';

it('CHILD_TABLES covers every table that has a user_id column (no silent PDn leak)', () => {
  const db = openDb(':memory:');
  runMigrations(db);
  const tables = (db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`).all() as { name: string }[])
    .map((t) => t.name)
    .filter((name) => (db.prepare(`PRAGMA table_info(${name})`).all() as { name: string }[]).some((c) => c.name === 'user_id'));
  for (const t of tables) expect(CHILD_TABLES as readonly string[]).toContain(t);
});

it('deletes checkins before follow_ups without FK rollback', () => {
  const db = openDb(':memory:');
  runMigrations(db);
  const now = Date.now();
  db.prepare('INSERT INTO users (tg_user_id, created_at) VALUES (?, ?)').run(555, now);
  const uid = (db.prepare('SELECT id FROM users WHERE tg_user_id=?').get(555) as { id: number }).id;
  db.prepare('INSERT INTO checkins (user_id, created_at, wheel_scores, energy, step_outcome) VALUES (?,?,?,?,?)')
    .run(uid, now, 'enc', 'enc', 'done');
  deleteUserData(db, 555);
  expect((db.prepare('SELECT COUNT(*) c FROM checkins WHERE user_id=?').get(uid) as any).c).toBe(0);
});
```
(Match the file's existing imports for `openDb`, `runMigrations`, `deleteUserData`. Export `CHILD_TABLES` from `deletion.ts` — see Step 4.)

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @stasis/server test -- deletion`
Expected: FAIL — `checkins` table doesn't exist / `CHILD_TABLES` not exported / doesn't contain `checkins`.

- [ ] **Step 3: Append migration version 3**

In `apps/server/src/db/migrate.ts`, add to the `MIGRATIONS` array after version 2:
```ts
  {
    version: 3,
    up(db: Db): void {
      db.exec(`
        CREATE TABLE IF NOT EXISTS checkins (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL REFERENCES users(id),
          created_at INTEGER NOT NULL,
          wheel_scores TEXT NOT NULL,
          energy TEXT NOT NULL,
          step_ref INTEGER,
          step_outcome TEXT,
          note TEXT
        );
      `);
      const cols = db.prepare('PRAGMA table_info(follow_ups)').all() as { name: string }[];
      if (!cols.some((c) => c.name === 'kind')) {
        db.exec(`ALTER TABLE follow_ups ADD COLUMN kind TEXT NOT NULL DEFAULT 'step';`);
      }
      db.exec(`CREATE INDEX IF NOT EXISTS idx_checkins_user ON checkins(user_id);`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_follow_ups_due ON follow_ups(due_at) WHERE sent_at IS NULL;`);
    },
  },
```

- [ ] **Step 4: Update deletion.ts — export CHILD_TABLES, add checkins before follow_ups**

In `apps/server/src/db/deletion.ts`, change the constant line to (note `checkins` sits before `follow_ups`, and `export`):
```ts
export const CHILD_TABLES = ['shares', 'profiles', 'test_runs', 'checkins', 'consents', 'signals', 'follow_ups'] as const;
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @stasis/server test -- deletion migrate`
Expected: PASS. Also run the full server suite to confirm the new migration doesn't break existing migration tests: `pnpm --filter @stasis/server test`.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/db/migrate.ts apps/server/src/db/deletion.ts apps/server/src/db/deletion.test.ts
git commit -m "feat(db): checkins table + follow_ups.kind (migration v3); deletion covers checkins + guard test"
```

---

### Task 2: `checkins` repository

**Files:**
- Create: `apps/server/src/db/checkins.repo.ts`
- Test: `apps/server/src/db/checkins.repo.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type StepOutcome = 'done' | 'partial' | 'missed' | 'changed';
  export interface CheckinInput { wheel: WheelScores; energy: number; stepRef: number | null; stepOutcome: StepOutcome | null; note: string | null }
  export interface CheckinRow { id: number; userId: number; createdAt: number; wheel: WheelScores; energy: number; stepRef: number | null; stepOutcome: StepOutcome | null; note: string | null }
  export function checkinsRepo(db: Db, encKey: string): {
    save(userId: number, input: CheckinInput, now: number): { id: number };
    history(userId: number): CheckinRow[]; // ascending by created_at, decrypted
  }
  ```

- [ ] **Step 1: Write the failing test**

Create `apps/server/src/db/checkins.repo.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { openDb } from './connection.js';
import { runMigrations } from './migrate.js';
import { checkinsRepo } from './checkins.repo.js';

const ENC = '00'.repeat(32);
function seedUser(db: ReturnType<typeof openDb>): number {
  db.prepare('INSERT INTO users (tg_user_id, created_at) VALUES (?, ?)').run(777, 1);
  return (db.prepare('SELECT id FROM users WHERE tg_user_id=?').get(777) as { id: number }).id;
}
const wheel = { health: 5, family: 5, rest: 5, friends: 5, career: 5, hobby: 5 };

describe('checkinsRepo', () => {
  it('round-trips a checkin, decrypting wheel/energy/note; step_outcome stored plaintext', () => {
    const db = openDb(':memory:'); runMigrations(db);
    const uid = seedUser(db);
    const repo = checkinsRepo(db, ENC);
    repo.save(uid, { wheel: { ...wheel, career: 3 }, energy: 4, stepRef: null, stepOutcome: 'partial', note: 'секрет' }, 1000);
    const rows = repo.history(uid);
    expect(rows).toHaveLength(1);
    expect(rows[0].wheel.career).toBe(3);
    expect(rows[0].energy).toBe(4);
    expect(rows[0].stepOutcome).toBe('partial');
    expect(rows[0].note).toBe('секрет');
    // note is encrypted at rest, not plaintext
    const raw = db.prepare('SELECT note, step_outcome FROM checkins WHERE id=?').get(rows[0].id) as any;
    expect(raw.note).not.toContain('секрет');
    expect(raw.step_outcome).toBe('partial');
  });

  it('history is ascending by created_at', () => {
    const db = openDb(':memory:'); runMigrations(db);
    const uid = seedUser(db);
    const repo = checkinsRepo(db, ENC);
    repo.save(uid, { wheel, energy: 5, stepRef: null, stepOutcome: 'done', note: null }, 2000);
    repo.save(uid, { wheel, energy: 5, stepRef: null, stepOutcome: 'done', note: null }, 1000);
    expect(repo.history(uid).map((r) => r.createdAt)).toEqual([1000, 2000]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @stasis/server test -- checkins.repo`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the repo**

Create `apps/server/src/db/checkins.repo.ts`:
```ts
import type { Db } from './connection.js';
import type { WheelScores } from '@stasis/shared';
import { encryptField, decryptField } from '../crypto/field.js';

export type StepOutcome = 'done' | 'partial' | 'missed' | 'changed';
export interface CheckinInput { wheel: WheelScores; energy: number; stepRef: number | null; stepOutcome: StepOutcome | null; note: string | null }
export interface CheckinRow { id: number; userId: number; createdAt: number; wheel: WheelScores; energy: number; stepRef: number | null; stepOutcome: StepOutcome | null; note: string | null }

export function checkinsRepo(db: Db, encKey: string) {
  const ins = db.prepare(
    `INSERT INTO checkins (user_id, created_at, wheel_scores, energy, step_ref, step_outcome, note) VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  const selHistory = db.prepare(`SELECT * FROM checkins WHERE user_id = ? ORDER BY created_at ASC`);
  const enc = (o: unknown) => encryptField(JSON.stringify(o), encKey);

  const map = (r: any): CheckinRow => ({
    id: r.id, userId: r.user_id, createdAt: r.created_at,
    wheel: JSON.parse(decryptField(r.wheel_scores, encKey)) as WheelScores,
    energy: JSON.parse(decryptField(r.energy, encKey)) as number,
    stepRef: r.step_ref, stepOutcome: r.step_outcome, note: r.note ? decryptField(r.note, encKey) : null,
  });

  return {
    save(userId: number, input: CheckinInput, now: number): { id: number } {
      const res = ins.run(userId, now, enc(input.wheel), enc(input.energy), input.stepRef,
        input.stepOutcome, input.note ? encryptField(input.note, encKey) : null);
      return { id: Number(res.lastInsertRowid) };
    },
    history(userId: number): CheckinRow[] {
      return (selHistory.all(userId) as any[]).map(map);
    },
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @stasis/server test -- checkins.repo`
Expected: PASS (2/2).

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/db/checkins.repo.ts apps/server/src/db/checkins.repo.test.ts
git commit -m "feat(db): checkins repository (encrypted wheel/energy/note, plaintext outcome)"
```

---

### Task 3: `computeDigest` engine (pure) + wording layer

**Files:**
- Create: `apps/server/src/engine/digest.ts`
- Test: `apps/server/src/engine/digest.test.ts`

**Interfaces:**
- Consumes: `CheckinRow[]` (Task 2), `WheelScores`, `AREAS` (`@stasis/shared`).
- Produces:
  ```ts
  export type Observation =
    | { kind: 'step'; outcome: StepOutcome }
    | { kind: 'sphere'; area: Area; delta: number }
    | { kind: 'pattern'; area: Area }
    | { kind: 'energy'; delta: number };
  export interface Digest { observations: Observation[]; nextStep: 'continue' | 'shrink' | 'new'; safety: boolean }
  export function computeDigest(history: DigestHistory, now: number): Digest;
  // DigestHistory = { wheels: {createdAt:number; wheel:WheelScores}[]; checkins: CheckinRow[]; resourceState: 'ok'|'low'|'critical' }
  ```

- [ ] **Step 1: Write the failing golden tests**

Create `apps/server/src/engine/digest.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { computeDigest } from './digest.js';

const w = (career: number) => ({ health: 5, family: 5, rest: 5, friends: 5, career, hobby: 5 });
const base = { resourceState: 'ok' as const };

describe('computeDigest (deterministic selection)', () => {
  it('always includes the step outcome and a next step', () => {
    const d = computeDigest({ ...base,
      wheels: [{ createdAt: 1, wheel: w(5) }],
      checkins: [{ id: 1, userId: 1, createdAt: 2, wheel: w(5), energy: 5, stepRef: 1, stepOutcome: 'done', note: null }],
    }, 3);
    expect(d.observations.some((o) => o.kind === 'step' && o.outcome === 'done')).toBe(true);
    expect(d.nextStep).toBe('new'); // done -> propose a new step
  });

  it('flags a sphere that dropped by >= 2 since last', () => {
    const d = computeDigest({ ...base,
      wheels: [{ createdAt: 1, wheel: w(8) }],
      checkins: [{ id: 1, userId: 1, createdAt: 2, wheel: w(5), energy: 5, stepRef: 1, stepOutcome: 'missed', note: null }],
    }, 3);
    expect(d.observations.some((o) => o.kind === 'sphere' && o.area === 'career' && o.delta === -3)).toBe(true);
    expect(d.nextStep).toBe('shrink'); // missed -> offer to shrink
  });

  it('emits a recurring pattern only from the 3rd data point', () => {
    const ck = (createdAt: number) => ({ id: createdAt, userId: 1, createdAt, wheel: w(3), energy: 5, stepRef: 1, stepOutcome: 'missed' as const, note: null });
    const d = computeDigest({ ...base, wheels: [{ createdAt: 1, wheel: w(3) }], checkins: [ck(2), ck(3)] }, 4);
    expect(d.observations.some((o) => o.kind === 'pattern' && o.area === 'career')).toBe(true);
  });

  it('routes to safety and emits nothing chipper when resourceState is critical', () => {
    const d = computeDigest({ resourceState: 'critical',
      wheels: [{ createdAt: 1, wheel: w(2) }],
      checkins: [{ id: 1, userId: 1, createdAt: 2, wheel: w(2), energy: 1, stepRef: 1, stepOutcome: 'missed', note: null }],
    }, 3);
    expect(d.safety).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @stasis/server test -- digest`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the pure function**

Create `apps/server/src/engine/digest.ts`:
```ts
import { AREAS, type Area, type WheelScores } from '@stasis/shared';
import type { CheckinRow, StepOutcome } from '../db/checkins.repo.js';

const SPHERE_DELTA_MIN = 2;

export type Observation =
  | { kind: 'step'; outcome: StepOutcome }
  | { kind: 'sphere'; area: Area; delta: number }
  | { kind: 'pattern'; area: Area }
  | { kind: 'energy'; delta: number };

export interface DigestHistory {
  wheels: { createdAt: number; wheel: WheelScores }[];
  checkins: CheckinRow[];
  resourceState: 'ok' | 'low' | 'critical';
}
export interface Digest { observations: Observation[]; nextStep: 'continue' | 'shrink' | 'new'; safety: boolean }

function biggestDrop(prev: WheelScores, curr: WheelScores): { area: Area; delta: number } | null {
  let worst: { area: Area; delta: number } | null = null;
  for (const a of AREAS) {
    const delta = curr[a] - prev[a];
    if (Math.abs(delta) >= SPHERE_DELTA_MIN && (!worst || Math.abs(delta) > Math.abs(worst.delta))) worst = { area: a, delta };
  }
  return worst;
}

// _now reserved for future time-based selection (recency weighting); kept in the
// signature so callers pass it and selection stays a pure function of (data, now).
export function computeDigest(history: DigestHistory, _now: number): Digest {
  const safety = history.resourceState === 'critical';
  const last = history.checkins[history.checkins.length - 1];
  const observations: Observation[] = [];

  if (last?.stepOutcome) observations.push({ kind: 'step', outcome: last.stepOutcome });

  // sphere drift: latest wheel vs the previous snapshot (checkin wheels + the onboarding wheel)
  const wheelSeries = [...history.wheels.map((w) => w.wheel), ...history.checkins.map((c) => c.wheel)];
  if (wheelSeries.length >= 2) {
    const drop = biggestDrop(wheelSeries[wheelSeries.length - 2], wheelSeries[wheelSeries.length - 1]);
    if (drop) observations.push({ kind: 'sphere', area: drop.area, delta: drop.delta });
  }

  // recurring pattern: same missed/low sphere across the last 2 checkins (needs >= 2 checkins => 3rd data point)
  if (history.checkins.length >= 2) {
    const missed = history.checkins.slice(-2).every((c) => c.stepOutcome === 'missed');
    if (missed) {
      const lowest = AREAS.reduce((lo, a) => (last.wheel[a] < last.wheel[lo] ? a : lo), AREAS[0]);
      observations.push({ kind: 'pattern', area: lowest });
    }
  }

  const nextStep: Digest['nextStep'] =
    last?.stepOutcome === 'done' ? 'new' : last?.stepOutcome === 'missed' ? 'shrink' : 'continue';

  return { observations: observations.slice(0, 3), nextStep, safety };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @stasis/server test -- digest`
Expected: PASS (4/4).

- [ ] **Step 5: Add the wording layer (varied copy, outside the golden core)**

Create the render map in the same file's sibling or in the miniapp copy. Server-side, add a helper `digestCopy.ts` if the digest text is server-rendered; if the Mini App renders it (recommended, mirrors ResultScreen copy constants), the observations/nextStep are sent as data and the wording lives client-side. Decision (per spec): **client renders wording**. So no server wording layer — the API returns the `Digest` object. Skip this step server-side; wording is Task 6. (Recorded here so the reviewer knows the split is intentional.)

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/engine/digest.ts apps/server/src/engine/digest.test.ts
git commit -m "feat(engine): computeDigest — deterministic dynamics-digest selection + golden tests"
```

---

### Task 4: Nudge substrate — `kind`, scheduler re-entrancy, check-in nudge, next-checkin scheduling

**Files:**
- Modify: `apps/server/src/db/followups.repo.ts` (schedule takes `kind`; add a `scheduleCheckin` helper)
- Modify: `apps/server/src/followup/scheduler.ts` (re-entrancy guard; branch message by `kind`)
- Test: `apps/server/src/followup.test.ts`

**Interfaces:**
- Consumes: `follow_ups.kind` column (Task 1).
- Produces: `followUpsRepo(...).scheduleCheckin(userId, dueAt)`; `due()` rows now carry `kind`.

- [ ] **Step 1: Write the failing tests**

Add to `apps/server/src/followup.test.ts`:
```ts
it('scheduleCheckin creates a due checkin nudge that respects opt-out', () => {
  const db = openDb(':memory:'); runMigrations(db);
  // seed user (match the file's existing seed helper)
  const uid = seedUser(db);
  const repo = followUpsRepo(db, ENC);
  repo.scheduleCheckin(uid, 1000);
  const due = repo.due(2000);
  expect(due.some((r) => r.kind === 'checkin')).toBe(true);
});

it('a long/overlapping tick does not double-send (re-entrancy guard)', async () => {
  // Given one due row and a bot whose sendMessage is slow, two overlapping
  // startScheduler ticks must send exactly once. Simulate by calling runDueFollowUps
  // twice concurrently against the same now and asserting markSent gates it to 1.
  const db = openDb(':memory:'); runMigrations(db);
  const uid = seedUser(db);
  followUpsRepo(db, ENC).schedule(uid, 'fire:career', 'шаг', 1000);
  let sends = 0;
  const bot = { api: { sendMessage: async () => { sends++; } } } as any;
  await Promise.all([runDueFollowUps(db, ENC, bot, 2000), runDueFollowUps(db, ENC, bot, 2000)]);
  expect(sends).toBe(1);
});
```
(Use the file's existing `openDb`, `runMigrations`, `followUpsRepo`, `runDueFollowUps`, `ENC`, and its user-seed pattern.)

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @stasis/server test -- followup`
Expected: FAIL — `scheduleCheckin` undefined; `kind` not on rows; the overlap test may already pass or fail depending on timing — the guard makes it deterministic.

- [ ] **Step 3: Repo — add `kind` to rows + scheduleCheckin**

In `apps/server/src/db/followups.repo.ts`: add `kind: string` to `FollowUpRow`, select it in `map` (`kind: r.kind`), change `insert` to include `kind`, and add a `scheduleCheckin`:
```ts
  const insert = db.prepare(
    `INSERT INTO follow_ups (user_id, card_ref, step_text, due_at, unsubscribed, kind, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  // ...in the returned object, update schedule() to pass kind='step':
  //   insert.run(userId, cardRef, encryptField(stepText, encKey), dueAt, optedOut ? 1 : 0, 'step', Date.now());
  // add:
  scheduleCheckin(userId: number, dueAt: number): { id: number } {
    const optedOut = (optedOutStmt.get(userId) as { followups_opt_out?: number } | undefined)?.followups_opt_out === 1;
    const res = insert.run(userId, 'checkin', encryptField('', encKey), dueAt, optedOut ? 1 : 0, 'checkin', Date.now());
    return { id: Number(res.lastInsertRowid) };
  },
```
Add `kind` to `FollowUpRow` and `map`:
```ts
export interface FollowUpRow { id: number; userId: number; cardRef: string; stepText: string; dueAt: number; sentAt: number | null; response: string | null; kind: string }
// map: add `kind: r.kind,`
```

- [ ] **Step 4: Scheduler — re-entrancy guard + branch by kind**

In `apps/server/src/followup/scheduler.ts`, add a module-level guard and branch the message:
```ts
let running = false;

export async function runDueFollowUps(db: Db, encKey: string, bot: Bot, now: number): Promise<number> {
  if (running) return 0;
  running = true;
  try {
    const followUps = followUpsRepo(db, encKey);
    const users = usersRepo(db);
    let sent = 0;
    for (const row of followUps.due(now)) {
      const user = users.getById(row.userId);
      if (!user) continue;
      try {
        if (row.kind === 'checkin') {
          await bot.api.sendMessage(user.tgUserId, 'Прошло время — 2 минуты на короткий чек-ин? Посмотрим, что сдвинулось.', {
            reply_markup: { inline_keyboard: [[{ text: 'Открыть чек-ин', callback_data: `checkin:${row.id}:open` }]] },
          });
        } else {
          await bot.api.sendMessage(user.tgUserId, `Как прошёл шаг „${row.stepText}"?`, {
            reply_markup: { inline_keyboard: [[
              { text: 'Сделал', callback_data: `followup:${row.id}:done` },
              { text: 'Частично', callback_data: `followup:${row.id}:partial` },
              { text: 'Не вышло', callback_data: `followup:${row.id}:failed` },
            ]] },
          });
        }
        followUps.markSent(row.id);
        sent++;
      } catch (e) {
        console.error('nudge send failed', row.id, e instanceof Error ? e.message : e);
      }
    }
    return sent;
  } finally {
    running = false;
  }
}
```
(Keep `startScheduler` unchanged.) The check-in nudge's button opens the Mini App check-in — wire the `checkin:` callback in the bot to reply with the web_app URL or a deep link in Task 5.

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @stasis/server test -- followup`
Expected: PASS. Then full server suite: `pnpm --filter @stasis/server test` (existing follow-up tests must still pass with the new `kind` column defaulting to `'step'`).

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/db/followups.repo.ts apps/server/src/followup/scheduler.ts apps/server/src/followup.test.ts
git commit -m "feat(followup): checkin nudge kind + scheduler re-entrancy guard"
```

---

### Task 5: Contract + server API (check-in prompt + submit-checkin)

**Files:**
- Modify: `packages/shared/src/schemas.ts` (CheckinPrompt, CheckinSubmit, DigestPayload)
- Modify: `apps/server/src/app.ts` (routes `GET /checkin`, `POST /checkin`; bot `checkin:` callback)
- Test: `apps/server/src/app.checkin.test.ts` (new)

**Interfaces:**
- Consumes: `checkinsRepo` (T2), `computeDigest` (T3), `followUpsRepo.scheduleCheckin` (T4).
- Produces: `GET /checkin` → `{ lastStep: { text, cardRef } | null, lastWheel: WheelScores | null }` (memory anchor); `POST /checkin` (auth, initData) with `CheckinSubmit` → `{ digest: Digest }` and schedules the next check-in.

- [ ] **Step 1: Add the contract schemas (shared)**

In `packages/shared/src/schemas.ts` add:
```ts
export const CheckinSubmitSchema = z.object({
  wheel: WheelScoresSchema,
  energy: z.number().int().min(1).max(6),
  stepRef: z.number().int().nullable(),
  stepOutcome: z.enum(['done', 'partial', 'missed', 'changed']).nullable(),
  note: z.string().max(500).nullable(),
});
export type CheckinSubmit = z.infer<typeof CheckinSubmitSchema>;
```
(Reuse the existing `WheelScoresSchema`. The `Digest` type from the engine is server-internal; the API returns it as JSON — add a `DigestSchema` mirroring `engine/digest.ts` `Digest` if you want the client to validate it, else type it on the client.)

- [ ] **Step 2: Write the failing endpoint test**

Create `apps/server/src/app.checkin.test.ts` modelled on `apps/server/src/app.submit.test.ts` (same buildApp + auth helper). Assert: `POST /checkin` with a valid `CheckinSubmit` and a valid initData returns `200` with a `digest` object containing a `step` observation; and a `checkins` row was written; and a next check-in nudge was scheduled (`follow_ups` has a `kind='checkin'` row for the user). Reuse that file's initData/auth fixture verbatim.

- [ ] **Step 3: Run to verify it fails**

Run: `pnpm --filter @stasis/server test -- app.checkin`
Expected: FAIL — route not found.

- [ ] **Step 4: Implement the routes**

In `apps/server/src/app.ts`, following the existing `/submit` route pattern (auth via initData, repository access, `deps.content`):
- `GET /checkin` (authed): read the user's latest `follow_ups` step row (the last `kind='step'` with a `step_text`/`card_ref`) and latest wheel (from `test_runs`/`checkins`); return `{ lastStep, lastWheel }`.
- `POST /checkin` (authed): validate body with `CheckinSubmitSchema`; `checkinsRepo.save(userId, {...}, Date.now())`; build `DigestHistory` from `test_runs` wheels + `checkinsRepo.history(userId)` + the user's current `resource_state` (from the latest profile); `const digest = computeDigest(history, Date.now())`; `followUpsRepo(db, encKey).scheduleCheckin(userId, Date.now() + 14*24*3600*1000)`; return `{ digest }`.
- Bot `checkin:<id>:open` callback: answer with the Mini App URL (reuse the `/start` web_app URL / `MINIAPP_URL`) so tapping opens the check-in flow. (The nudge button already carries the callback.)

Wire the forbidden-lexicon note: the digest returns codes, not prose (wording is client-side, Task 6), so no server copy to gate here except the two nudge strings in Task 4 — add them to whatever content/lexicon test scans user-facing strings if such a test exists; otherwise assert in the checkin test that the nudge text has no forbidden roots.

- [ ] **Step 5: Rebuild shared + run tests**

Run: `pnpm --filter @stasis/shared build && pnpm --filter @stasis/server test -- app.checkin app.submit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/schemas.ts apps/server/src/app.ts apps/server/src/app.checkin.test.ts
git commit -m "feat(api): checkin prompt + submit-checkin endpoints; contract"
```

---

### Task 6: Mini App — check-in flow + digest screen

**Files:**
- Create: `apps/miniapp/src/screens/CheckinScreen.tsx`, `apps/miniapp/src/screens/DigestScreen.tsx`
- Modify: `apps/miniapp/src/api.ts` (getCheckin, submitCheckin), `apps/miniapp/src/App.tsx` (route/entry), `apps/miniapp/src/flow.ts` (a `checkin` entry mode)
- Test: `apps/miniapp/src/screens/checkin.test.tsx` (new)

**Interfaces:**
- Consumes: `GET /checkin`, `POST /checkin` (T5); the `Digest` shape (T3).

- [ ] **Step 1: Write failing screen tests**

Create `apps/miniapp/src/screens/checkin.test.tsx`: render `CheckinScreen` with a mocked `lastStep`, assert the memory line shows the prior step text and the four outcome buttons; render `DigestScreen` with a `Digest` fixture and assert (a) the step-outcome copy renders, (b) a `sphere` observation renders its area label, (c) `nextStep==='shrink'` shows the "make it smaller" CTA, (d) `safety===true` renders the safety block copy (reuse `SAFETY_TEXT`) and none of the chipper dynamics lines. Use `vi.fn()` props like `result.test.tsx`.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @stasis/miniapp test -- checkin`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement CheckinScreen + DigestScreen + api + wiring**

Build `CheckinScreen` (memory-anchored step question → reuse `Wheel` for the 6-tap re-rate → a 1-tap energy `Likert max=6`) calling `api.submitCheckin(payload)` → renders `DigestScreen` with the returned `digest`. `DigestScreen` maps `Digest.observations` + `nextStep` to varied copy constants (the wording layer — like `ELEMENT_STRENGTH_COPY`), with a `safety` branch reusing `SAFETY_TEXT`. Add `getCheckin()`/`submitCheckin()` to `api.ts` mirroring `getAssessment`/`submit`. Add a `checkin` entry to the flow so the app can open directly into the check-in (the bot deep-link opens the Mini App; App reads a `?mode=checkin` param or a `startapp` payload — match how the app currently reads entry). Copy: observational, no clinical language, forbidden-lexicon-clean.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @stasis/miniapp test -- checkin` then full `pnpm --filter @stasis/miniapp test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/miniapp/src/screens/CheckinScreen.tsx apps/miniapp/src/screens/DigestScreen.tsx apps/miniapp/src/screens/checkin.test.tsx apps/miniapp/src/api.ts apps/miniapp/src/App.tsx apps/miniapp/src/flow.ts
git commit -m "feat(miniapp): check-in flow + dynamics digest screen"
```

---

### Task 7: Whole-workspace verification + SPEC_CHANGELOG

**Files:** Modify `SPEC_CHANGELOG.md`

- [ ] **Step 1: Full build + test**

Run `pnpm -r build` (with `VITE_POLICY_URL=/policy.html VITE_OFFER_URL=/offer.html` set ONLY for the build), then in a clean shell (no VITE vars) `pnpm -r test`.
Expected: shared/server/miniapp build; all tests PASS.

- [ ] **Step 2: SPEC_CHANGELOG entry**

Append:
```markdown
## 2026-07-26 — Return loop (companion step 1)
- Added a periodic memory-anchored check-in (step outcome + wheel re-rate + 1-tap energy) + a deterministic `computeDigest` synthesis (observation codes + nextStep, wording client-side), reusing the follow-up nudge substrate (`follow_ups.kind`). New `checkins` table (wheel/energy/note encrypted, `step_outcome` plaintext), in `CHILD_TABLES` before `follow_ups` with a table-coverage guard test. Scheduler gained a re-entrancy guard; new indexes. Success metric = week-2 return (timestamp-based). Belief-selection-without-element + onboarding simplification deferred to Spec #2.
```

- [ ] **Step 3: Commit**

```bash
git add SPEC_CHANGELOG.md
git commit -m "docs(changelog): return loop (companion step 1)"
```

---

## Notes

- **Metric:** week-2 return = a `checkins` row with `created_at` in days 8–21 after the user's first `test_runs.created_at`. Compute from timestamps only (both plaintext) — no decryption. A read-only analytics query, not part of the request path.
- **Belief handling stays minimal** here (reference the existing step; `nextStep` is `continue|shrink|new` — the client maps `new` to the current weakest sphere's `sphereInsight`, which covers all 6 spheres). Full situation-anchored belief elicitation is Spec #2.
- **Wording lives client-side** (DigestScreen), mirroring the existing `ResultScreen` copy-constant pattern; the server returns only the deterministic `Digest` codes. This keeps the golden core free of copy and keeps "non-determinism only in wording".
