import { describe, expect, it } from 'vitest';
import {
  VERSUS_PROTOCOL_VERSION,
  allFruitCodes,
  createEnvelope,
  getScoreResult,
  isMatchFinishData,
  isScoreUpdateData,
  isValidEnvelope,
  parseFruitCode,
  serializeFruitCode,
  versusChannelTopic,
} from './versus';

describe('fruit room codes', () => {
  it('generates all 216 ordered codes without collisions', () => {
    const codes = allFruitCodes().map(serializeFruitCode);
    expect(codes).toHaveLength(216);
    expect(new Set(codes)).toHaveLength(216);
  });

  it('round-trips a canonical fruit code to its channel', () => {
    const code = parseFruitCode('banana-apple-melon');
    expect(code).toEqual(['banana', 'apple', 'melon']);
    expect(code && versusChannelTopic(code)).toBe('versus:v1:banana-apple-melon');
    expect(parseFruitCode('banana-pear-melon')).toBeNull();
  });
});

describe('Versus protocol validation', () => {
  it('accepts the current room and expected opponent only', () => {
    const envelope = createEnvelope('room-1', 'opponent-1', { score: 3, sequence: 4 });
    expect(envelope.version).toBe(VERSUS_PROTOCOL_VERSION);
    expect(isValidEnvelope(envelope, 'room-1', 'opponent-1')).toBe(true);
    expect(isValidEnvelope(envelope, 'room-2', 'opponent-1')).toBe(false);
    expect(isValidEnvelope(envelope, 'room-1', 'opponent-2')).toBe(false);
  });

  it('rejects malformed score and finish payloads', () => {
    expect(isScoreUpdateData({ score: 2, sequence: 3 })).toBe(true);
    expect(isScoreUpdateData({ score: -1, sequence: 3 })).toBe(false);
    expect(isScoreUpdateData({ score: 2, sequence: 2.5 })).toBe(false);
    expect(isMatchFinishData({ score: 2, sequence: 3, reason: 'time_up' })).toBe(true);
    expect(isMatchFinishData({ score: 2, sequence: 3, reason: 'quit' })).toBe(false);
  });

  it('calculates score outcomes', () => {
    expect(getScoreResult(8, 4)).toBe('win');
    expect(getScoreResult(4, 8)).toBe('loss');
    expect(getScoreResult(8, 8)).toBe('tie');
  });
});
