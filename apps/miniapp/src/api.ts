import { RenderedResultSchema, type RenderedResult, type SubmitPayload } from '@stasis/shared';

export class ApiError extends Error {
  constructor(
    public status: number,
    msg: string
  ) {
    super(msg);
  }
}

export interface Api {
  authed(): Promise<void>;
  submit(payload: SubmitPayload): Promise<{ profileId: number; result: RenderedResult }>;
  signal(event: string, meta?: unknown): Promise<void>;
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

  return { authed, submit, signal };
}
