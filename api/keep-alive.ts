const json = (body: Record<string, unknown>, status: number) =>
  Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store, max-age=0',
    },
  });

export default {
  fetch(request: Request) {
    if (request.method !== 'GET') {
      return json({ ok: false, error: 'Method not allowed' }, 405);
    }
    return handleKeepAlive(request);
  },
};

export async function handleKeepAlive(request: Request): Promise<Response> {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return json({ ok: false, error: 'Unauthorized' }, 401);
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseSecret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseSecret) {
    return json({ ok: false, error: 'Server configuration is incomplete' }, 500);
  }

  try {
    const headers: Record<string, string> = {
      apikey: supabaseSecret,
      'Content-Type': 'application/json',
    };
    if (!supabaseSecret.startsWith('sb_secret_')) {
      headers.Authorization = `Bearer ${supabaseSecret}`;
    }

    const response = await fetch(`${supabaseUrl.replace(/\/$/, '')}/rest/v1/rpc/keep_alive`, {
      method: 'POST',
      headers,
      body: '{}',
      signal: AbortSignal.timeout(8_000),
      cache: 'no-store',
    });

    if (!response.ok) {
      return json({ ok: false, error: 'Supabase keep-alive request failed' }, 502);
    }

    const checkedAt = await response.json() as unknown;
    return json({ ok: true, checkedAt }, 200);
  } catch {
    return json({ ok: false, error: 'Supabase keep-alive request failed' }, 502);
  }
}
