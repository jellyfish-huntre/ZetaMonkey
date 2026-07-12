import {
  createRunToken,
  generateRankedQuestionBatch,
  hashRunToken,
} from './leaderboard-run-core';

const json = (body: Record<string, unknown>, status: number) =>
  Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store, max-age=0' },
  });

interface RpcError {
  message?: string;
}

interface AuthUser {
  id: string;
  email?: string;
  user_metadata?: { username?: string };
}

const serverConfig = () => ({
  url: process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  key: process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY,
});

const serviceHeaders = (key: string): Record<string, string> => {
  const headers: Record<string, string> = { apikey: key, 'Content-Type': 'application/json' };
  if (!key.startsWith('sb_secret_')) headers.Authorization = `Bearer ${key}`;
  return headers;
};

async function rpc<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { url, key } = serverConfig();
  if (!url || !key) throw new Error('SERVER_CONFIGURATION');
  const response = await fetch(`${url.replace(/\/$/, '')}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: serviceHeaders(key),
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({})) as RpcError;
    throw new Error(error.message || `RPC_${response.status}`);
  }
  return response.json() as Promise<T>;
}

async function optionalUser(request: Request): Promise<AuthUser | null> {
  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) return null;
  const { url, key } = serverConfig();
  if (!url || !key) throw new Error('SERVER_CONFIGURATION');
  const response = await fetch(`${url.replace(/\/$/, '')}/auth/v1/user`, {
    headers: { apikey: key, Authorization: authorization },
    cache: 'no-store',
  });
  if (!response.ok) throw new Error('INVALID_USER_SESSION');
  return response.json() as Promise<AuthUser>;
}

const usernameFor = (user: AuthUser): string =>
  (user.user_metadata?.username || user.email?.split('@')[0] || 'Player').trim().slice(0, 24);

export default {
  fetch(request: Request) {
    return handleLeaderboardRun(request);
  },
};

export async function handleLeaderboardRun(request: Request): Promise<Response> {
  if (request.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405);

  try {
    const body = await request.json() as Record<string, unknown>;
    const action = body.action;

    if (action === 'prepare') {
      const user = await optionalUser(request);
      const runToken = createRunToken();
      const batch = generateRankedQuestionBatch();
      const rows = await rpc<Array<{ run_id: string; prepared_expires_at: string }>>(
        'prepare_leaderboard_run',
        {
          p_token_hash: hashRunToken(runToken),
          p_user_id: user?.id ?? null,
          p_questions: batch.prompts,
          p_answer_key: batch.answers,
        },
      );
      const row = rows[0];
      if (!row) throw new Error('RUN_NOT_CREATED');
      return json({
        ok: true,
        runId: row.run_id,
        runToken,
        preparedExpiresAt: row.prepared_expires_at,
        questions: batch.prompts,
      }, 200);
    }

    const runId = typeof body.runId === 'string' ? body.runId : '';
    const runToken = typeof body.runToken === 'string' ? body.runToken : '';
    if (!runId || !runToken) return json({ ok: false, error: 'Invalid run credentials' }, 400);
    const tokenHash = hashRunToken(runToken);

    if (action === 'begin') {
      const rows = await rpc<Array<{ starts_at: string; ends_at: string }>>('begin_leaderboard_run', {
        p_run_id: runId,
        p_token_hash: tokenHash,
      });
      const row = rows[0];
      if (!row) throw new Error('RUN_NOT_STARTED');
      return json({ ok: true, startsAt: row.starts_at, endsAt: row.ends_at }, 200);
    }

    if (action === 'submit') {
      if (!Array.isArray(body.transcript)) return json({ ok: false, error: 'Invalid transcript' }, 400);
      const rows = await rpc<Array<{
        score: number;
        qpm: number;
        accuracy: number;
        skips: number;
        eligible: boolean;
        eligibility_reason: string | null;
      }>>('submit_leaderboard_run', {
        p_run_id: runId,
        p_token_hash: tokenHash,
        p_transcript: body.transcript,
      });
      const row = rows[0];
      if (!row) throw new Error('RUN_NOT_VERIFIED');
      return json({
        ok: true,
        score: row.score,
        qpm: row.qpm,
        accuracy: row.accuracy,
        skips: row.skips,
        eligible: row.eligible,
        eligibilityReason: row.eligibility_reason,
      }, 200);
    }

    if (action === 'claim') {
      const user = await optionalUser(request);
      if (!user) return json({ ok: false, error: 'Authentication required' }, 401);
      const rows = await rpc<Array<{ leaderboard_id: string; already_claimed: boolean }>>(
        'claim_leaderboard_run',
        {
          p_run_id: runId,
          p_token_hash: tokenHash,
          p_user_id: user.id,
          p_username: usernameFor(user),
        },
      );
      const row = rows[0];
      if (!row) throw new Error('RUN_NOT_CLAIMED');
      return json({ ok: true, leaderboardId: row.leaderboard_id, alreadyClaimed: row.already_claimed }, 200);
    }

    return json({ ok: false, error: 'Unknown action' }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Leaderboard run request failed';
    const status = message === 'INVALID_USER_SESSION' ? 401
      : message === 'SERVER_CONFIGURATION' ? 500
        : message.includes('INVALID_') || message.includes('EXPIRED') || message.includes('TOO_') ? 400
          : message.includes('NOT_FOUND') ? 404
            : message.includes('ALREADY') || message.includes('CONFLICT') ? 409
              : 502;
    return json({ ok: false, error: message }, status);
  }
}

