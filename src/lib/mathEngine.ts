export type Operation = '+' | '-' | '*' | '/';

export interface Question {
  id: string;
  num1: number;
  num2: number;
  operation: Operation;
  answer: number;
  startTime: number;
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

export const generateQuestion = (settings: GameSettings = DEFAULT_SETTINGS): Question => {
  const ops = settings.operations.length > 0 ? settings.operations : DEFAULT_SETTINGS.operations;
  const op = ops[Math.floor(Math.random() * ops.length)];
  let num1 = 0;
  let num2 = 0;
  let answer = 0;

  switch (op) {
    case '+': {
      const { min, max } = settings.ranges.add;
      num1 = Math.floor(Math.random() * (max - min + 1)) + min;
      num2 = Math.floor(Math.random() * (max - min + 1)) + min;
      answer = num1 + num2;
      break;
    }
    case '-': {
      const { min, max } = settings.ranges.sub;
      answer = Math.floor(Math.random() * (max - min + 1)) + min;
      num2 = Math.floor(Math.random() * (max - min + 1)) + min;
      num1 = answer + num2;
      break;
    }
    case '*': {
      const { min, max } = settings.ranges.mult;
      num1 = Math.floor(Math.random() * (max - min + 1)) + min;
      num2 = Math.floor(Math.random() * 99) + 2; // Keep second number standard for now or make it also configurable?
      answer = num1 * num2;
      break;
    }
    case '/': {
      const { min, max } = settings.ranges.div;
      answer = Math.floor(Math.random() * 99) + 2;
      num2 = Math.floor(Math.random() * (max - min + 1)) + min;
      num1 = answer * num2;
      break;
    }
  }

  return {
    id: crypto.randomUUID(),
    num1,
    num2,
    operation: op,
    answer,
    startTime: Date.now(),
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
