import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleKeepAlive } from './keep-alive';

const authorizedRequest = () => new Request('https://example.com/api/keep-alive', {
  headers: { Authorization: 'Bearer test-cron-secret' },
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('keep-alive endpoint', () => {
  it('rejects requests without the configured bearer secret', async () => {
    vi.stubEnv('CRON_SECRET', 'test-cron-secret');
    const response = await handleKeepAlive(new Request('https://example.com/api/keep-alive'));
    expect(response.status).toBe(401);
  });

  it('reports missing server-side Supabase configuration', async () => {
    vi.stubEnv('CRON_SECRET', 'test-cron-secret');
    vi.stubEnv('SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('SUPABASE_SECRET_KEY', '');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    const response = await handleKeepAlive(authorizedRequest());
    expect(response.status).toBe(500);
  });

  it('returns a gateway error when Supabase rejects the RPC', async () => {
    vi.stubEnv('CRON_SECRET', 'test-cron-secret');
    vi.stubEnv('SUPABASE_URL', 'https://project.supabase.co');
    vi.stubEnv('SUPABASE_SECRET_KEY', 'server-secret');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('failure', { status: 500 })));

    const response = await handleKeepAlive(authorizedRequest());
    expect(response.status).toBe(502);
  });

  it('returns the database timestamp after a successful RPC', async () => {
    vi.stubEnv('CRON_SECRET', 'test-cron-secret');
    vi.stubEnv('SUPABASE_URL', 'https://project.supabase.co/');
    vi.stubEnv('SUPABASE_SECRET_KEY', 'server-secret');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json('2026-07-10T12:00:00+00:00')));

    const response = await handleKeepAlive(authorizedRequest());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      checkedAt: '2026-07-10T12:00:00+00:00',
    });
    expect(fetch).toHaveBeenCalledWith(
      'https://project.supabase.co/rest/v1/rpc/keep_alive',
      expect.objectContaining({
        headers: expect.objectContaining({
          apikey: 'server-secret',
          Authorization: 'Bearer server-secret',
        }),
      }),
    );
  });

  it('uses modern secret keys only as an API key', async () => {
    vi.stubEnv('CRON_SECRET', 'test-cron-secret');
    vi.stubEnv('SUPABASE_URL', 'https://project.supabase.co');
    vi.stubEnv('SUPABASE_SECRET_KEY', 'sb_secret_modern-key');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json('2026-07-10T12:00:00+00:00')));

    await handleKeepAlive(authorizedRequest());
    expect(fetch).toHaveBeenCalledWith(
      'https://project.supabase.co/rest/v1/rpc/keep_alive',
      expect.objectContaining({
        headers: {
          apikey: 'sb_secret_modern-key',
          'Content-Type': 'application/json',
        },
      }),
    );
  });
});
