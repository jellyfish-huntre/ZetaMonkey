import { create } from 'zustand';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { DEFAULT_SETTINGS } from '../lib/mathEngine';
import { useGameStore } from './gameStore';
import {
  VERSUS_COUNTDOWN_MS,
  VERSUS_DISCONNECT_GRACE_MS,
  VERSUS_DURATION_SECONDS,
  createEnvelope,
  getScoreResult,
  isMatchFinishData,
  isMatchStartData,
  isScoreUpdateData,
  isStateSnapshotData,
  isValidEnvelope,
  parseFruitCode,
  serializeFruitCode,
  versusChannelTopic,
  type FruitCode,
  type MatchFinishData,
  type MatchStartData,
  type StateSnapshotData,
  type VersusResult,
  type VersusRole,
} from '../lib/versus';

type VersusPhase = 'idle' | 'reserving' | 'joining' | 'waiting' | 'countdown' | 'playing' | 'finished' | 'error';
type ConnectionState = 'offline' | 'connecting' | 'connected' | 'reconnecting';

interface RoomRpcRow {
  room_code: string;
  room_id: string;
  expires_at: string;
}

interface PresencePayload {
  roomId: string;
  playerId: string;
  role: VersusRole;
  displayName: string;
  onlineAt: string;
}

interface VersusState {
  phase: VersusPhase;
  connectionState: ConnectionState;
  roomCode: FruitCode | null;
  roomId: string | null;
  role: VersusRole | null;
  playerId: string | null;
  displayName: string;
  opponentId: string | null;
  opponentName: string;
  opponentConnected: boolean;
  opponentScore: number;
  opponentSequence: number;
  localScore: number;
  localSequence: number;
  localFinished: boolean;
  opponentFinished: boolean;
  countdown: number;
  disconnectRemaining: number | null;
  result: VersusResult | null;
  resultReason: 'score' | 'forfeit' | null;
  winnerId: string | null;
  error: string | null;
  createRoom: (displayName: string) => Promise<boolean>;
  joinRoom: (code: FruitCode, displayName: string) => Promise<boolean>;
  publishScore: (score: number) => Promise<void>;
  finishLocal: (score: number) => Promise<void>;
  leaveRoom: () => Promise<void>;
  resetSession: () => void;
}

let activeChannel: RealtimeChannel | null = null;
let currentStart: MatchStartData | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let countdownTimer: ReturnType<typeof setInterval> | null = null;
let startTimer: ReturnType<typeof setTimeout> | null = null;
let disconnectTimer: ReturnType<typeof setTimeout> | null = null;
let disconnectTicker: ReturnType<typeof setInterval> | null = null;
let startingMatch = false;

const initialState = {
  phase: 'idle' as VersusPhase,
  connectionState: 'offline' as ConnectionState,
  roomCode: null,
  roomId: null,
  role: null,
  playerId: null,
  displayName: 'Guest',
  opponentId: null,
  opponentName: 'Opponent',
  opponentConnected: false,
  opponentScore: 0,
  opponentSequence: -1,
  localScore: 0,
  localSequence: 0,
  localFinished: false,
  opponentFinished: false,
  countdown: 0,
  disconnectRemaining: null,
  result: null,
  resultReason: null,
  winnerId: null,
  error: null,
};

const cleanDisplayName = (value: string): string => {
  const trimmed = value.trim().replace(/\s+/g, ' ');
  return (trimmed || 'Guest').slice(0, 24);
};

const clearTimer = (timer: ReturnType<typeof setTimeout> | null) => {
  if (timer) clearTimeout(timer);
};

const clearIntervalTimer = (timer: ReturnType<typeof setInterval> | null) => {
  if (timer) clearInterval(timer);
};

const clearRuntimeTimers = () => {
  clearIntervalTimer(heartbeatTimer);
  clearIntervalTimer(countdownTimer);
  clearTimer(startTimer);
  clearTimer(disconnectTimer);
  clearIntervalTimer(disconnectTicker);
  heartbeatTimer = null;
  countdownTimer = null;
  startTimer = null;
  disconnectTimer = null;
  disconnectTicker = null;
};

const rpcErrorMessage = (message: string, action: 'create' | 'join'): string => {
  if (message.includes('NO_ROOMS_AVAILABLE')) return 'All Versus rooms are busy. Try again shortly.';
  if (message.includes('ROOM_NOT_FOUND_OR_FULL')) return 'That room is unavailable, full, or has expired.';
  return action === 'create'
    ? 'Could not create a room. Check the Supabase configuration and try again.'
    : 'Could not join that room. Check the code and try again.';
};

const sendEvent = async <T>(event: string, data: T): Promise<void> => {
  const { roomId, playerId } = useVersusStore.getState();
  if (!activeChannel || !roomId || !playerId) return;

  await activeChannel.send({
    type: 'broadcast',
    event,
    payload: createEnvelope(roomId, playerId, data),
  });
};

const stopDisconnectGrace = () => {
  clearTimer(disconnectTimer);
  clearIntervalTimer(disconnectTicker);
  disconnectTimer = null;
  disconnectTicker = null;
  useVersusStore.setState({ disconnectRemaining: null });
};

const stopHeartbeat = () => {
  clearIntervalTimer(heartbeatTimer);
  heartbeatTimer = null;
};

const updateResultFromScores = () => {
  const state = useVersusStore.getState();
  if (!state.localFinished || state.resultReason === 'forfeit') return;
  useVersusStore.setState({
    result: getScoreResult(state.localScore, state.opponentScore),
    resultReason: 'score',
  });
};

const startLocalGame = (start: MatchStartData) => {
  const game = useGameStore.getState();
  if (game.mode === 'versus' && (game.status === 'playing' || game.status === 'finished')) return;

  useGameStore.getState().startGame(
    VERSUS_DURATION_SECONDS,
    DEFAULT_SETTINGS,
    undefined,
    { mode: 'versus', seed: start.seed, endsAt: start.endsAt },
  );
  useVersusStore.setState({ phase: 'playing', countdown: 0 });
};

const applyMatchStart = (start: MatchStartData) => {
  if (currentStart && currentStart.seed === start.seed && currentStart.endsAt === start.endsAt) return;
  currentStart = start;

  clearIntervalTimer(countdownTimer);
  clearTimer(startTimer);

  const updateCountdown = () => {
    const remaining = Math.max(0, Math.ceil((start.startsAt - Date.now()) / 1000));
    useVersusStore.setState({ countdown: remaining });
  };

  useVersusStore.setState({ phase: 'countdown', error: null });
  updateCountdown();
  countdownTimer = setInterval(updateCountdown, 200);

  const delay = Math.max(0, start.startsAt - Date.now());
  startTimer = setTimeout(() => {
    clearIntervalTimer(countdownTimer);
    countdownTimer = null;
    startTimer = null;
    startLocalGame(start);
  }, delay);
};

const broadcastSnapshot = async () => {
  const state = useVersusStore.getState();
  const game = useGameStore.getState();
  const data: StateSnapshotData = {
    start: currentStart,
    score: state.localScore,
    sequence: state.localSequence,
    finished: state.localFinished,
    finishReason: state.resultReason === 'forfeit' ? 'forfeit' : state.localFinished ? 'time_up' : null,
    winnerId: state.winnerId ?? undefined,
  };
  if (game.mode === 'versus') data.score = game.score;
  await sendEvent('state_snapshot', data);
};

const declareOpponentForfeit = async () => {
  const state = useVersusStore.getState();
  if (!state.playerId || state.resultReason === 'forfeit') return;

  stopDisconnectGrace();
  stopHeartbeat();
  useVersusStore.setState({
    phase: 'finished',
    localFinished: true,
    result: 'win',
    resultReason: 'forfeit',
    winnerId: state.playerId,
  });

  if (useGameStore.getState().status === 'playing') useGameStore.getState().endGame();

  const finish: MatchFinishData = {
    score: state.localScore,
    sequence: state.localSequence,
    reason: 'forfeit',
    winnerId: state.playerId,
  };
  await sendEvent('match_finish', finish);
};

const startDisconnectGrace = () => {
  if (disconnectTimer) return;
  const deadline = Date.now() + VERSUS_DISCONNECT_GRACE_MS;

  const updateRemaining = () => {
    useVersusStore.setState({
      disconnectRemaining: Math.max(0, Math.ceil((deadline - Date.now()) / 1000)),
    });
  };

  updateRemaining();
  disconnectTicker = setInterval(updateRemaining, 250);
  disconnectTimer = setTimeout(() => {
    disconnectTimer = null;
    void declareOpponentForfeit();
  }, VERSUS_DISCONNECT_GRACE_MS);
};

const beginMatchAsHost = async () => {
  const state = useVersusStore.getState();
  if (
    state.role !== 'host'
    || currentStart
    || startingMatch
    || !state.opponentConnected
    || !state.roomId
    || !state.playerId
    || !state.opponentId
  ) return;

  startingMatch = true;
  const { data: started, error } = await supabase.rpc('start_versus_room', {
    p_room_id: state.roomId,
    p_host_id: state.playerId,
    p_guest_id: state.opponentId,
  });
  if (error || started !== true) {
    startingMatch = false;
    useVersusStore.setState({
      phase: 'error',
      error: 'The opponent reservation expired before the match could start.',
    });
    return;
  }

  const startsAt = Date.now() + VERSUS_COUNTDOWN_MS;
  const start: MatchStartData = {
    seed: crypto.getRandomValues(new Uint32Array(1))[0],
    startsAt,
    endsAt: startsAt + VERSUS_DURATION_SECONDS * 1000,
  };
  applyMatchStart(start);
  startingMatch = false;
  await sendEvent('match_start', start);
};

const extractPresence = (channel: RealtimeChannel, roomId: string, playerId: string): PresencePayload[] => {
  const rawState = channel.presenceState() as unknown as Record<string, unknown[]>;
  const presences: PresencePayload[] = [];

  for (const entries of Object.values(rawState)) {
    for (const entry of entries) {
      if (typeof entry !== 'object' || entry === null) continue;
      const candidate = entry as Partial<PresencePayload>;
      if (
        candidate.roomId === roomId
        && typeof candidate.playerId === 'string'
        && candidate.playerId !== playerId
        && (candidate.role === 'host' || candidate.role === 'guest')
        && typeof candidate.displayName === 'string'
      ) {
        presences.push(candidate as PresencePayload);
      }
    }
  }
  return presences;
};

const handlePresenceSync = () => {
  const state = useVersusStore.getState();
  if (!activeChannel || !state.roomId || !state.playerId) return;

  const opponent = extractPresence(activeChannel, state.roomId, state.playerId)
    .find((presence) => presence.role !== state.role);

  if (opponent) {
    stopDisconnectGrace();
    useVersusStore.setState({
      opponentId: opponent.playerId,
      opponentName: opponent.displayName,
      opponentConnected: true,
    });
    if (state.role === 'host') void beginMatchAsHost();
    else void sendEvent('state_request', {});
    return;
  }

  if (!state.opponentId) return;
  useVersusStore.setState({ opponentConnected: false });

  if (state.phase === 'countdown' || state.phase === 'playing') {
    startDisconnectGrace();
  } else if (state.phase === 'waiting' && state.role === 'guest') {
    useVersusStore.setState({ phase: 'error', error: 'The host left this room.' });
  }
};

const handleBroadcast = (event: string, raw: unknown) => {
  const state = useVersusStore.getState();
  if (!state.roomId || !state.playerId || !isValidEnvelope(raw, state.roomId, state.opponentId)) return;
  if (raw.senderId === state.playerId) return;

  if (!state.opponentId) {
    useVersusStore.setState({ opponentId: raw.senderId });
  }

  if (event === 'match_start' && isMatchStartData(raw.data)) {
    applyMatchStart(raw.data);
    return;
  }

  if (event === 'score_update' && isScoreUpdateData(raw.data)) {
    if (raw.data.sequence <= state.opponentSequence || raw.data.score < state.opponentScore) return;
    useVersusStore.setState({
      opponentScore: raw.data.score,
      opponentSequence: raw.data.sequence,
    });
    updateResultFromScores();
    return;
  }

  if (event === 'match_finish' && isMatchFinishData(raw.data)) {
    if (raw.data.sequence >= state.opponentSequence && raw.data.score >= state.opponentScore) {
      useVersusStore.setState({
        opponentScore: raw.data.score,
        opponentSequence: raw.data.sequence,
        opponentFinished: true,
      });
    }
    if (raw.data.reason === 'forfeit' && raw.data.winnerId) {
      const localWon = raw.data.winnerId === state.playerId;
      useVersusStore.setState({
        phase: 'finished',
        localFinished: true,
        result: localWon ? 'win' : 'loss',
        resultReason: 'forfeit',
        winnerId: raw.data.winnerId,
      });
      stopHeartbeat();
      if (useGameStore.getState().status === 'playing') useGameStore.getState().endGame();
    } else {
      updateResultFromScores();
    }
    return;
  }

  if (event === 'state_request') {
    void broadcastSnapshot();
    return;
  }

  if (event === 'state_snapshot' && isStateSnapshotData(raw.data)) {
    if (!currentStart && raw.data.start) applyMatchStart(raw.data.start);
    if (raw.data.sequence >= state.opponentSequence && raw.data.score >= state.opponentScore) {
      useVersusStore.setState({
        opponentScore: raw.data.score,
        opponentSequence: raw.data.sequence,
        opponentFinished: raw.data.finished,
      });
    }
    if (raw.data.finishReason === 'forfeit' && raw.data.winnerId) {
      const localWon = raw.data.winnerId === state.playerId;
      useVersusStore.setState({
        phase: 'finished',
        localFinished: true,
        result: localWon ? 'win' : 'loss',
        resultReason: 'forfeit',
        winnerId: raw.data.winnerId,
      });
      stopHeartbeat();
      if (useGameStore.getState().status === 'playing') useGameStore.getState().endGame();
    } else {
      updateResultFromScores();
    }
    return;
  }

  if (event === 'room_closed' && (state.phase === 'waiting' || state.phase === 'countdown')) {
    clearIntervalTimer(countdownTimer);
    clearTimer(startTimer);
    countdownTimer = null;
    startTimer = null;
    currentStart = null;
    startingMatch = false;
    useVersusStore.setState({
      phase: 'error',
      countdown: 0,
      opponentConnected: false,
      error: 'The other player closed this room.',
    });
  }
};

const startHeartbeat = (roomId: string, playerId: string) => {
  clearIntervalTimer(heartbeatTimer);
  heartbeatTimer = setInterval(() => {
    void supabase.rpc('heartbeat_versus_room', { p_room_id: roomId, p_player_id: playerId });
  }, 60_000);
};

const connectToRoom = async (
  roomCode: FruitCode,
  roomId: string,
  playerId: string,
  role: VersusRole,
  displayName: string,
): Promise<boolean> => {
  const channel = supabase.channel(versusChannelTopic(roomCode), {
    config: {
      broadcast: { ack: true, self: false },
      presence: { key: playerId },
    },
  });
  activeChannel = channel;

  const broadcastEvents = [
    'match_start',
    'score_update',
    'match_finish',
    'state_request',
    'state_snapshot',
    'room_closed',
  ];
  for (const event of broadcastEvents) {
    channel.on('broadcast', { event }, (message: { payload?: unknown }) => {
      handleBroadcast(event, message.payload);
    });
  }
  channel.on('presence', { event: 'sync' }, handlePresenceSync);

  return new Promise((resolve) => {
    let resolved = false;
    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        const current = useVersusStore.getState();
        useVersusStore.setState({
          connectionState: 'connected',
          phase: current.phase === 'reserving' || current.phase === 'joining' || current.phase === 'error'
            ? 'waiting'
            : current.phase,
          error: null,
        });
        await channel.track({
          roomId,
          playerId,
          role,
          displayName,
          onlineAt: new Date().toISOString(),
        } satisfies PresencePayload);
        startHeartbeat(roomId, playerId);
        await sendEvent('state_request', {});
        if (!resolved) {
          resolved = true;
          resolve(true);
        }
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        const active = useVersusStore.getState().phase;
        useVersusStore.setState({
          connectionState: active === 'reserving' || active === 'joining' ? 'offline' : 'reconnecting',
          ...(active === 'reserving' || active === 'joining'
            ? { phase: 'error' as const, error: 'Could not connect to the Versus channel.' }
            : {}),
        });
        if (!resolved) {
          resolved = true;
          resolve(false);
        }
      } else if (status === 'CLOSED') {
        useVersusStore.setState({ connectionState: 'offline' });
      }
    });
  });
};

export const useVersusStore = create<VersusState>((set, get) => ({
  ...initialState,

  createRoom: async (rawDisplayName) => {
    await get().leaveRoom();
    const playerId = crypto.randomUUID();
    const displayName = cleanDisplayName(rawDisplayName);
    set({
      ...initialState,
      phase: 'reserving',
      connectionState: 'connecting',
      playerId,
      role: 'host',
      displayName,
    });

    const { data, error } = await supabase.rpc('create_versus_room', { p_host_id: playerId });
    if (error) {
      set({ phase: 'error', connectionState: 'offline', error: rpcErrorMessage(error.message, 'create') });
      return false;
    }

    const row = (data as RoomRpcRow[] | null)?.[0];
    const roomCode = row ? parseFruitCode(row.room_code) : null;
    if (!row || !roomCode) {
      set({ phase: 'error', connectionState: 'offline', error: 'Supabase returned an invalid room code.' });
      return false;
    }

    set({ roomCode, roomId: row.room_id });
    const connected = await connectToRoom(roomCode, row.room_id, playerId, 'host', displayName);
    if (!connected) {
      await supabase.rpc('leave_versus_room', { p_room_id: row.room_id, p_player_id: playerId });
    }
    return connected;
  },

  joinRoom: async (roomCode, rawDisplayName) => {
    await get().leaveRoom();
    const playerId = crypto.randomUUID();
    const displayName = cleanDisplayName(rawDisplayName);
    set({
      ...initialState,
      phase: 'joining',
      connectionState: 'connecting',
      playerId,
      role: 'guest',
      roomCode,
      displayName,
    });

    const { data, error } = await supabase.rpc('join_versus_room', {
      p_code: serializeFruitCode(roomCode),
      p_guest_id: playerId,
    });
    if (error) {
      set({ phase: 'error', connectionState: 'offline', error: rpcErrorMessage(error.message, 'join') });
      return false;
    }

    const row = (data as RoomRpcRow[] | null)?.[0];
    if (!row) {
      set({ phase: 'error', connectionState: 'offline', error: 'That room is unavailable, full, or has expired.' });
      return false;
    }

    set({ roomId: row.room_id });
    const connected = await connectToRoom(roomCode, row.room_id, playerId, 'guest', displayName);
    if (!connected) {
      await supabase.rpc('leave_versus_room', { p_room_id: row.room_id, p_player_id: playerId });
    }
    return connected;
  },

  publishScore: async (score) => {
    const state = get();
    if (state.phase !== 'playing' || score < state.localScore) return;
    const sequence = state.localSequence + 1;
    set({ localScore: score, localSequence: sequence });
    await sendEvent('score_update', { score, sequence });
  },

  finishLocal: async (score) => {
    const state = get();
    if (state.localFinished || state.resultReason === 'forfeit') return;
    const sequence = state.localSequence + 1;
    set({
      phase: 'finished',
      localScore: score,
      localSequence: sequence,
      localFinished: true,
    });
    stopHeartbeat();
    updateResultFromScores();
    await sendEvent('match_finish', { score, sequence, reason: 'time_up' } satisfies MatchFinishData);
  },

  leaveRoom: async () => {
    const state = get();
    const shouldNotify = state.role === 'host'
      && (state.phase === 'waiting' || state.phase === 'countdown');

    clearRuntimeTimers();
    currentStart = null;
    startingMatch = false;

    if (shouldNotify) {
      try {
        await sendEvent('room_closed', {});
      } catch {
        // Presence and lease expiry are the fallback when a best-effort close cannot be sent.
      }
    }

    if (activeChannel) {
      try {
        await activeChannel.untrack();
      } catch {
        // The channel may already be disconnected.
      }
      await supabase.removeChannel(activeChannel);
      activeChannel = null;
    }

    if (state.roomId && state.playerId) {
      await supabase.rpc('leave_versus_room', {
        p_room_id: state.roomId,
        p_player_id: state.playerId,
      });
    }
    set({ ...initialState });
  },

  resetSession: () => {
    clearRuntimeTimers();
    currentStart = null;
    startingMatch = false;
    activeChannel = null;
    set({ ...initialState });
  },
}));
