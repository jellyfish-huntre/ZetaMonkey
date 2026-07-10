export const VERSUS_PROTOCOL_VERSION = 1 as const;
export const VERSUS_DURATION_SECONDS = 120;
export const VERSUS_COUNTDOWN_MS = 3_000;
export const VERSUS_DISCONNECT_GRACE_MS = 10_000;

export const FRUIT_IDS = ['banana', 'apple', 'grape', 'orange', 'cherry', 'melon'] as const;

export type FruitId = (typeof FRUIT_IDS)[number];
export type FruitCode = readonly [FruitId, FruitId, FruitId];
export type VersusRole = 'host' | 'guest';
export type VersusResult = 'win' | 'loss' | 'tie';

export interface MatchStartData {
  seed: number;
  startsAt: number;
  endsAt: number;
}

export interface VersusEnvelope<T> {
  version: typeof VERSUS_PROTOCOL_VERSION;
  roomId: string;
  senderId: string;
  sentAt: number;
  data: T;
}

export interface ScoreUpdateData {
  score: number;
  sequence: number;
}

export interface MatchFinishData extends ScoreUpdateData {
  reason: 'time_up' | 'forfeit';
  winnerId?: string;
}

export interface StateSnapshotData {
  start: MatchStartData | null;
  score: number;
  sequence: number;
  finished: boolean;
  finishReason: 'time_up' | 'forfeit' | null;
  winnerId?: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export const isFruitId = (value: unknown): value is FruitId =>
  typeof value === 'string' && (FRUIT_IDS as readonly string[]).includes(value);

export const isFruitCode = (value: unknown): value is FruitCode =>
  Array.isArray(value) && value.length === 3 && value.every(isFruitId);

export const serializeFruitCode = (code: FruitCode): string => code.join('-');

export const parseFruitCode = (value: string): FruitCode | null => {
  const parts = value.toLowerCase().split('-');
  return isFruitCode(parts) ? parts : null;
};

export const versusChannelTopic = (code: FruitCode): string =>
  `versus:v1:${serializeFruitCode(code)}`;

export const allFruitCodes = (): FruitCode[] => {
  const codes: FruitCode[] = [];
  for (const first of FRUIT_IDS) {
    for (const second of FRUIT_IDS) {
      for (const third of FRUIT_IDS) {
        codes.push([first, second, third]);
      }
    }
  }
  return codes;
};

export const createEnvelope = <T>(roomId: string, senderId: string, data: T): VersusEnvelope<T> => ({
  version: VERSUS_PROTOCOL_VERSION,
  roomId,
  senderId,
  sentAt: Date.now(),
  data,
});

export const isValidEnvelope = (
  value: unknown,
  roomId: string,
  opponentId?: string | null,
): value is VersusEnvelope<unknown> => {
  if (!isRecord(value)) return false;
  if (value.version !== VERSUS_PROTOCOL_VERSION || value.roomId !== roomId) return false;
  if (typeof value.senderId !== 'string' || typeof value.sentAt !== 'number') return false;
  if (opponentId && value.senderId !== opponentId) return false;
  return 'data' in value;
};

export const isMatchStartData = (value: unknown): value is MatchStartData => {
  if (!isRecord(value)) return false;
  return Number.isInteger(value.seed)
    && typeof value.startsAt === 'number'
    && typeof value.endsAt === 'number'
    && value.endsAt > value.startsAt;
};

export const isScoreUpdateData = (value: unknown): value is ScoreUpdateData => {
  if (!isRecord(value)) return false;
  return typeof value.score === 'number'
    && Number.isInteger(value.score)
    && value.score >= 0
    && typeof value.sequence === 'number'
    && Number.isInteger(value.sequence)
    && value.sequence >= 0;
};

export const isMatchFinishData = (value: unknown): value is MatchFinishData => {
  if (!isScoreUpdateData(value) || !isRecord(value)) return false;
  if (value.reason !== 'time_up' && value.reason !== 'forfeit') return false;
  return value.winnerId === undefined || typeof value.winnerId === 'string';
};

export const isStateSnapshotData = (value: unknown): value is StateSnapshotData => {
  if (!isRecord(value) || !isScoreUpdateData(value)) return false;
  if (value.start !== null && !isMatchStartData(value.start)) return false;
  if (typeof value.finished !== 'boolean') return false;
  if (value.finishReason !== null && value.finishReason !== 'time_up' && value.finishReason !== 'forfeit') {
    return false;
  }
  return value.winnerId === undefined || typeof value.winnerId === 'string';
};

export const getScoreResult = (localScore: number, opponentScore: number): VersusResult => {
  if (localScore > opponentScore) return 'win';
  if (localScore < opponentScore) return 'loss';
  return 'tie';
};
