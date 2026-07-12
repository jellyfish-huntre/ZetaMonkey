import { describe, expect, it } from 'vitest';
import { generateRankedQuestionBatch, hashRunToken } from './leaderboard-run-core';

describe('ranked question generation', () => {
  it('creates exactly 300 indexed prompts and a private matching answer key', () => {
    const batch = generateRankedQuestionBatch();
    expect(batch.prompts).toHaveLength(300);
    expect(batch.answers).toHaveLength(300);

    batch.prompts.forEach((question, index) => {
      expect(question.questionIndex).toBe(index);
      expect(question).not.toHaveProperty('answer');
      const expected = question.operation === '+' ? question.num1 + question.num2
        : question.operation === '-' ? question.num1 - question.num2
          : question.operation === '*' ? question.num1 * question.num2
            : question.num1 / question.num2;
      expect(batch.answers[index]).toBe(expected);
    });
  });

  it('uses the production default ranges', () => {
    const { prompts } = generateRankedQuestionBatch(2_000);
    for (const question of prompts) {
      if (question.operation === '+') {
        expect(question.num1).toBeGreaterThanOrEqual(2);
        expect(question.num1).toBeLessThanOrEqual(100);
        expect(question.num2).toBeGreaterThanOrEqual(2);
        expect(question.num2).toBeLessThanOrEqual(100);
      } else if (question.operation === '-') {
        expect(question.num2).toBeGreaterThanOrEqual(2);
        expect(question.num2).toBeLessThanOrEqual(100);
        expect(question.num1 - question.num2).toBeGreaterThanOrEqual(2);
        expect(question.num1 - question.num2).toBeLessThanOrEqual(100);
      } else if (question.operation === '*') {
        expect(question.num1).toBeGreaterThanOrEqual(2);
        expect(question.num1).toBeLessThanOrEqual(12);
        expect(question.num2).toBeGreaterThanOrEqual(2);
        expect(question.num2).toBeLessThanOrEqual(100);
      } else {
        expect(question.num2).toBeGreaterThanOrEqual(2);
        expect(question.num2).toBeLessThanOrEqual(12);
        expect(Number.isInteger(question.num1 / question.num2)).toBe(true);
      }
    }
  });

  it('hashes run credentials deterministically without retaining the token', () => {
    expect(hashRunToken('secret')).toBe(hashRunToken('secret'));
    expect(hashRunToken('secret')).not.toContain('secret');
    expect(hashRunToken('secret')).toMatch(/^[0-9a-f]{64}$/);
  });
});

