import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, createSeededRandom, generateQuestion } from './mathEngine';

describe('seeded question generation', () => {
  it('produces the same ordered question sequence for both players', () => {
    const firstRandom = createSeededRandom(20260710);
    const secondRandom = createSeededRandom(20260710);

    const firstSequence = Array.from({ length: 25 }, () => {
      const question = generateQuestion(DEFAULT_SETTINGS, undefined, firstRandom);
      return [question.num1, question.operation, question.num2, question.answer];
    });
    const secondSequence = Array.from({ length: 25 }, () => {
      const question = generateQuestion(DEFAULT_SETTINGS, undefined, secondRandom);
      return [question.num1, question.operation, question.num2, question.answer];
    });

    expect(firstSequence).toEqual(secondSequence);
  });

  it('produces a different sequence for a different seed', () => {
    const first = generateQuestion(DEFAULT_SETTINGS, undefined, createSeededRandom(1));
    const second = generateQuestion(DEFAULT_SETTINGS, undefined, createSeededRandom(2));
    expect([first.num1, first.operation, first.num2]).not.toEqual([second.num1, second.operation, second.num2]);
  });
});
