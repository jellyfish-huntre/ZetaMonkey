import { createHash, randomBytes, randomInt } from 'node:crypto';

export type RankedOperation = '+' | '-' | '*' | '/';

export interface RankedQuestionPrompt {
  questionIndex: number;
  num1: number;
  num2: number;
  operation: RankedOperation;
}

export interface RankedQuestionBatch {
  prompts: RankedQuestionPrompt[];
  answers: number[];
}

const OPERATIONS: RankedOperation[] = ['+', '-', '*', '/'];

const integer = (min: number, max: number) => randomInt(min, max + 1);

export function generateRankedQuestionBatch(count = 300): RankedQuestionBatch {
  const prompts: RankedQuestionPrompt[] = [];
  const answers: number[] = [];

  for (let questionIndex = 0; questionIndex < count; questionIndex += 1) {
    const operation = OPERATIONS[randomInt(OPERATIONS.length)];
    let num1: number;
    let num2: number;
    let answer: number;

    if (operation === '+') {
      num1 = integer(2, 100);
      num2 = integer(2, 100);
      answer = num1 + num2;
    } else if (operation === '-') {
      answer = integer(2, 100);
      num2 = integer(2, 100);
      num1 = answer + num2;
    } else if (operation === '*') {
      num1 = integer(2, 12);
      num2 = integer(2, 100);
      answer = num1 * num2;
    } else {
      answer = integer(2, 100);
      num2 = integer(2, 12);
      num1 = answer * num2;
    }

    prompts.push({ questionIndex, num1, num2, operation });
    answers.push(answer);
  }

  return { prompts, answers };
}

export const createRunToken = (): string => randomBytes(32).toString('base64url');

export const hashRunToken = (token: string): string =>
  createHash('sha256').update(token, 'utf8').digest('hex');

