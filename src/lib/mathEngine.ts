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

export const generateQuestion = (settings: GameSettings = DEFAULT_SETTINGS, targetCategory?: Category): Question => {
  const ops = settings.operations.length > 0 ? settings.operations : DEFAULT_SETTINGS.operations;
  
  let num1 = 0;
  let num2 = 0;
  let op: Operation = '+';
  let answer = 0;

  // Simple retry loop for targetCategory
  // Parse trait if present: "* 13", "/ 7", "+ 15", "- 8"
  const traitMatch = targetCategory?.match(/^([\+\-\*\/])\s*(\d+)$/);
  const traitOp = traitMatch ? traitMatch[1] as Operation : null;
  const traitNum = traitMatch ? parseInt(traitMatch[2]) : null;

  let attempts = 0;
  while (attempts < 50) {
    op = traitOp || ops[Math.floor(Math.random() * ops.length)];
    
    switch (op) {
      case '+': {
        const { min, max } = settings.ranges.add;
        num1 = Math.floor(Math.random() * (max - min + 1)) + min;
        num2 = Math.floor(Math.random() * (max - min + 1)) + min;
        if (traitOp === '+' && traitNum !== null) {
          if (Math.random() > 0.5) num1 = traitNum; else num2 = traitNum;
        }
        answer = num1 + num2;
        break;
      }
      case '-': {
        const { min, max } = settings.ranges.sub;
        // Subtraction is Addition in reverse: (min-max) + (min-max)
        answer = Math.floor(Math.random() * (max - min + 1)) + min;
        num2 = Math.floor(Math.random() * (max - min + 1)) + min;
        if (traitOp === '-' && traitNum !== null) {
          num2 = traitNum;
        }
        num1 = answer + num2;
        break;
      }
      case '*': {
        const { min, max } = settings.ranges.mult;
        // Multiplication follows: (min-max) * (2-100) as per standard settings request
        num1 = Math.floor(Math.random() * (max - min + 1)) + min;
        num2 = Math.floor(Math.random() * 99) + 2; // 2-100
        if (traitOp === '*' && traitNum !== null) {
          if (Math.random() > 0.5) num1 = traitNum; else num2 = traitNum;
        }
        answer = num1 * num2;
        break;
      }
      case '/': {
        const { min, max } = settings.ranges.div;
        // Division is Multiplication in reverse: (Quotient 2-100) * (Divisor min-max)
        answer = Math.floor(Math.random() * 99) + 2; // 2-100 (Quotient)
        num2 = Math.floor(Math.random() * (max - min + 1)) + min; // 2-12 (Divisor)
        if (traitOp === '/' && traitNum !== null) {
          num2 = traitNum;
        }
        num1 = answer * num2;
        break;
      }
    }

    const categories = categorizeQuestion(num1, num2, op);
    const isMatch = !targetCategory || 
                    categories.includes(targetCategory) || 
                    (traitOp === op && (num1 === traitNum || num2 === traitNum));

    if (isMatch) {
      return {
        id: crypto.randomUUID(),
        num1,
        num2,
        operation: op,
        answer,
        startTime: Date.now(),
        categories,
      };
    }
    attempts++;
  }

  // Fallback
  return {
    id: crypto.randomUUID(),
    num1: traitNum || 10,
    num2: (traitOp === '/' || traitOp === '-') ? (traitNum || 10) : 10,
    operation: traitOp || '+',
    answer: 20,
    startTime: Date.now(),
    categories: targetCategory ? [targetCategory] : ['add_basic'],
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
