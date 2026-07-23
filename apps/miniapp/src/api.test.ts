import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { SubmitPayload, RenderedResult } from '@stasis/shared';
import { createApi, ApiError } from './api.js';

const payload: SubmitPayload = {
  wheel: { health: 5, family: 5, rest: 5, friends: 5, career: 5, hobby: 5 },
  elementAnswers: [{ itemId: 'e1', value: 3 }],
  strategyAnswers: [{ itemId: 's1', value: 3 }],
  resourceAnswers: [{ itemId: 'r1', value: 3 }],
};

const validResult: RenderedResult = {
  leadElement: 'fire',
  secondElement: null,
  isMixed: false,
  resourceState: 'ok',
  sphereInsight: {
    area: 'career',
    observation: 'x',
    recommendation: { trigger: 't', action: 'a', minThreshold: 'm', doneCriterion: 'd' },
    reflectiveQuestion: 'q',
  },
  beliefCards: [],
  strategy: {
    lead: { name: 'n', coreDrive: 'c', childhoodLogic: 'l', underStress: 'u', gift: 'g', cost: 'co', growthNudge: 'gn' },
    guides: [],
  },
};

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

describe('createApi', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    (globalThis as any).fetch = fetchMock;
  });

  it('authed() POSTs /auth with tma header and caches the token', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ token: 'tok123' }));
    const api = createApi('https://api.test', 'raw');
    await api.authed();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.test/auth');
    expect(init.method).toBe('POST');
    expect(init.headers.authorization).toBe('tma raw');

    // 2nd call is a no-op: authed() is idempotent.
    await api.authed();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('authed() throws ApiError on 401', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'invalid_init_data' }, 401));
    const api = createApi('https://api.test', 'raw');
    await expect(api.authed()).rejects.toBeInstanceOf(ApiError);
  });

  it('submit() authenticates first, sends Bearer token, and returns parsed result', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ token: 'tok123' }))
      .mockResolvedValueOnce(jsonResponse({ profileId: 42, result: validResult }));

    const api = createApi('https://api.test', 'raw');
    const res = await api.submit(payload);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [authUrl] = fetchMock.mock.calls[0];
    const [submitUrl, submitInit] = fetchMock.mock.calls[1];
    expect(authUrl).toBe('https://api.test/auth');
    expect(submitUrl).toBe('https://api.test/submit');
    expect(submitInit.headers.authorization).toBe('Bearer tok123');
    expect(submitInit.method).toBe('POST');
    expect(JSON.parse(submitInit.body)).toEqual(payload);

    expect(res.profileId).toBe(42);
    expect(res.result).toEqual(validResult);
  });

  it('submit() does not re-auth on a second call once token is cached', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ token: 'tok123' }))
      .mockResolvedValueOnce(jsonResponse({ profileId: 1, result: validResult }))
      .mockResolvedValueOnce(jsonResponse({ profileId: 2, result: validResult }));

    const api = createApi('https://api.test', 'raw');
    await api.submit(payload);
    await api.submit(payload);

    expect(fetchMock).toHaveBeenCalledTimes(3); // 1 auth + 2 submits
  });

  it('submit() throws ApiError on 401', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ token: 'tok123' }))
      .mockResolvedValueOnce(jsonResponse({ error: 'invalid_session' }, 401));

    const api = createApi('https://api.test', 'raw');
    await expect(api.submit(payload)).rejects.toBeInstanceOf(ApiError);
  });

  it('submit() throws ApiError when the response body fails RenderedResultSchema', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ token: 'tok123' }))
      .mockResolvedValueOnce(jsonResponse({ profileId: 1, result: { garbage: true } }));

    const api = createApi('https://api.test', 'raw');
    await expect(api.submit(payload)).rejects.toBeInstanceOf(ApiError);
  });

  it('signal() does not throw when fetch rejects', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network down'));
    const api = createApi('https://api.test', 'raw');
    await expect(api.signal('viewed_result')).resolves.toBeUndefined();
  });

  it('signal() does not throw when fetch returns 500', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'boom' }, 500));
    const api = createApi('https://api.test', 'raw');
    await expect(api.signal('viewed_result', { foo: 'bar' })).resolves.toBeUndefined();
  });
});
