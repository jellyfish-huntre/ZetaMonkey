export type Operation = '+' | '-' | '*' | '/';

import { categorizeQuestion, type Category } from './mathUtils';

export type { Category };

export interface Question {
  id: string;
  num1: number;
  num2: number;
  operation: Operation;
  answer: number;
  startTime: number;
  categories: Category[];
}

export interface GameSettings {
  operations: Operation[];
  ranges: {
    add: { min: number; max: number };
    sub: { min: number; max: number };
    mult: { min: number; max: number };
    div: { min: number; max: number };
  };
  duration: number;
}

export const DEFAULT_SETTINGS: GameSettings = {
  operations: ['+', '-', '*', '/'],
  ranges: {
    add: { min: 2, max: 100 },
    sub: { min: 2, max: 100 },
    mult: { min: 2, max: 12 },
    div: { min: 2, max: 12 }
  },
  duration: 120
};

export type RandomSource = () => number;

export const createSeededRandom = (seed: number): RandomSource => {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
};

export const generateQuestion = (
  settings: GameSettings = DEFAULT_SETTINGS,
  targetCategory?: Category,
  random: RandomSource = Math.random,
): Question => {
  const rand = (min: number, max: number) => Math.floor(random() * (max - min + 1)) + min;
  
  const createQ = (n1: number, n2: number, op: Operation): Question => {
    let ans = 0;
    if (op === '+') ans = n1 + n2;
    if (op === '-') ans = n1 - n2;
    if (op === '*') ans = n1 * n2;
    if (op === '/') ans = n1 / n2; // Assumes clean division provided by logic
    
    return {
      id: crypto.randomUUID(),
      num1: n1,
      num2: n2,
      operation: op,
      answer: ans,
      startTime: Date.now(),
      categories: categorizeQuestion(n1, n2, op),
    };
  };

  if (targetCategory) {
    // 1. Handle dynamic/trait categories (e.g. "* 13")
    const traitMatch = targetCategory.match(/^([+*/-])\s*(\d+)$/);
    if (traitMatch) {
      const op = traitMatch[1] as Operation;
      const num = parseInt(traitMatch[2]);
      if (op === '+') return createQ(num, rand(2, 100), '+'); // or randomize order
      if (op === '-') return createQ(rand(num, num + 100), num, '-');
      if (op === '*') return createQ(num, rand(2, 12), '*');
      if (op === '/') return createQ(num * rand(2, 12), num, '/');
    }

    // 2. Handle specific named categories
    if (targetCategory === 'add_basic') return createQ(rand(2, 9), rand(2, 9), '+');
    if (targetCategory === 'add_2digit') return createQ(rand(10, 99), rand(10, 99), '+');
    if (targetCategory === 'add_3digit') return createQ(rand(100, 999), rand(100, 999), '+');

    if (targetCategory === 'sub_basic') {
      const ans = rand(2, 9);
      const sub = rand(2, 9);
      return createQ(ans + sub, sub, '-');
    }
    if (targetCategory === 'sub_2digit') {
      const ans = rand(10, 99);
      const sub = rand(10, 99);
      return createQ(ans + sub, sub, '-');
    }
    if (targetCategory === 'sub_3digit') {
      const ans = rand(100, 999);
      const sub = rand(100, 999);
      return createQ(ans + sub, sub, '-');
    }

    // Multiplication
    if (targetCategory.startsWith('mult_')) {
      const suffix = targetCategory.replace('mult_', '');
      const n = parseInt(suffix);
      if (!isNaN(n)) {
        // mult_2 ... mult_12
        return random() > 0.5
          ? createQ(n, rand(2, 100), '*')
          : createQ(rand(2, 100), n, '*');
      }
      if (targetCategory === 'mult_2digit') return createQ(rand(10, 99), rand(10, 99), '*');
      if (targetCategory === 'mult_3digit') {
          // At least one number >= 100
          const n1 = rand(100, 999);
          const n2 = rand(2, 999); // Can be any size really, but let's keep it reasonable
          return random() > 0.5 ? createQ(n1, n2, '*') : createQ(n2, n1, '*');
      }
      if (targetCategory === 'mult_table') return createQ(rand(2, 12), rand(2, 12), '*');
    }

    // Division
    if (targetCategory.startsWith('div_')) {
      const suffix = targetCategory.replace('div_', '');
      const n = parseInt(suffix);
      if (!isNaN(n)) {
        // div_2 ... div_12 (Divide BY n)
        const ans = rand(2, 100);
        return createQ(ans * n, n, '/');
      }
      if (targetCategory === 'div_table') {
        // Result <= 12, Divisor ? 
        // Logic: Table usually means within 12x12
        const n2 = rand(2, 12);
        const ans = rand(2, 12);
        return createQ(ans * n2, n2, '/');
      }
      if (targetCategory === 'div_long') {
        // Divisor > 12
        const n2 = rand(13, 99); 
        const ans = rand(2, 50);
        return createQ(ans * n2, n2, '/');
      }
    }
    
    // 'other' or unmatched
  }

  // DEFAULT / FALLBACK GENERATION (Use settings)
  const ops = settings.operations.length > 0 ? settings.operations : DEFAULT_SETTINGS.operations;
  
  let attempts = 0;
  while (attempts < 50) {
    const op = ops[Math.floor(random() * ops.length)];
    let n1 = 0, n2 = 0;
    
    // ... existing random logic ...
    switch (op) {
      case '+': {
        const { min, max } = settings.ranges.add;
        n1 = rand(min, max);
        n2 = rand(min, max);
        break;
      }
      case '-': {
        const { min, max } = settings.ranges.sub;
        const ans = rand(min, max);
        n2 = rand(min, max);
        n1 = ans + n2;
        break;
      }
      case '*': {
        const { min, max } = settings.ranges.mult;
        n1 = rand(min, max);
        n2 = rand(2, 100); // Standard multiply range
        break;
      }
      case '/': {
        const { min, max } = settings.ranges.div;
        const ans = rand(2, 100);
        n2 = rand(min, max);
        n1 = ans * n2;
        break;
      }
    }

    const q = createQ(n1, n2, op);
    if (!targetCategory || q.categories.includes(targetCategory)) {
        return q;
    }
    attempts++;
  }

  // Ultimate fallback if random generation fails
  return {
    id: crypto.randomUUID(),
    num1: 10,
    num2: 10,
    operation: '+',
    answer: 20,
    startTime: Date.now(),
    categories: ['add_basic'],
  };
};

export const isDefaultSettings = (settings: GameSettings): boolean => {
  if (settings.operations.length !== 4) return false;
  const opsMatch = ['+', '-', '*', '/'].every(op => settings.operations.includes(op as Operation));
  if (!opsMatch) return false;

  const d = DEFAULT_SETTINGS.ranges;
  const s = settings.ranges;
  return s.add.min === d.add.min && s.add.max === d.add.max &&
         s.sub.min === d.sub.min && s.sub.max === d.sub.max &&
         s.mult.min === d.mult.min && s.mult.max === d.mult.max &&
         s.div.min === d.div.min && s.div.max === d.div.max;
};

export const checkAnswer = (question: Question, input: string): boolean => {
  const inputNum = parseInt(input, 10);
  return !isNaN(inputNum) && inputNum === question.answer;
};
