import { RenderedResultSchema, type Area, type ConsentPayload, type RenderedResult, type SubmitPayload } from '@stasis/shared';

export class ApiError extends Error {
  constructor(
    public status: number,
    msg: string
  ) {
    super(msg);
  }
}

export interface Assessment {
  wheelAreas: Area[];
  elementItems: { id: string; statement: string }[];
  strategyItems: { id: number; situation: string; statement: string }[];
  resourceItems: { id: string; statement: string }[];
}

export interface Api {
  authed(): Promise<void>;
  getAssessment(): Promise<Assessment>;
  submit(payload: SubmitPayload): Promise<{ profileId: number; result: RenderedResult }>;
  signal(event: string, meta?: unknown): Promise<void>;
  recordConsent(payload: ConsentPayload): Promise<void>;
  createShare(profileId: number): Promise<{ slug: string; url: string }>;
  takeStep(cardRef: string, stepText: string): Promise<void>;
}

export function createApi(baseUrl: string, initDataRaw: string): Api {
  let token: string | null = null;

  async function authed(): Promise<void> {
    if (token) return;
    const res = await fetch(`${baseUrl}/auth`, {
      method: 'POST',
      headers: { authorization: `tma ${initDataRaw}` },
    });
    if (!res.ok) throw new ApiError(res.status, 'auth failed');
    const body = (await res.json()) as { token: string };
    token = body.token;
  }

  async function getAssessment(): Promise<Assessment> {
    const res = await fetch(`${baseUrl}/assessment`);
    if (!res.ok) throw new ApiError(res.status, 'assessment fetch failed');
    return (await res.json()) as Assessment;
  }

  async function submit(payload: SubmitPayload): Promise<{ profileId: number; result: RenderedResult }> {
    await authed();
    const res = await fetch(`${baseUrl}/submit`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new ApiError(res.status, 'submit failed');
    const body = (await res.json()) as { profileId: number; result: unknown };
    const parsed = RenderedResultSchema.safeParse(body.result);
    if (!parsed.success) throw new ApiError(500, 'invalid result payload');
    return { profileId: body.profileId, result: parsed.data };
  }

  async function signal(event: string, meta?: unknown): Promise<void> {
    try {
      await authed();
      const res = await fetch(`${baseUrl}/signal`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ event, meta }),
      });
      void res;
    } catch {
      // best-effort telemetry: never throw, never block the UI
    }
  }

  // Unlike signal() this is not best-effort: consent recording is the audit
  // trail for a compliance requirement, so failures must surface to the caller.
  async function recordConsent(payload: ConsentPayload): Promise<void> {
    await authed();
    const res = await fetch(`${baseUrl}/consent`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new ApiError(res.status, 'consent recording failed');
  }

  // Not best-effort: a failed share-link creation must surface so the caller
  // can fall back / retry rather than silently sharing nothing.
  async function createShare(profileId: number): Promise<{ slug: string; url: string }> {
    await authed();
    const res = await fetch(`${baseUrl}/share`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ profileId }),
    });
    if (!res.ok) throw new ApiError(res.status, 'share creation failed');
    return (await res.json()) as { slug: string; url: string };
  }

  // Not best-effort: the caller needs to know if scheduling the follow-up failed.
  async function takeStep(cardRef: string, stepText: string): Promise<void> {
    await authed();
    const res = await fetch(`${baseUrl}/followup`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ cardRef, stepText }),
    });
    if (!res.ok) throw new ApiError(res.status, 'take-step failed');
  }

  return { authed, getAssessment, submit, signal, recordConsent, createShare, takeStep };
}
