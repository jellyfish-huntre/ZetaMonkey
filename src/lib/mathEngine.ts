
export type Operation = '+' | '-' | '*' | '/';

export interface Question {
  id: string;
  num1: number;
  num2: number;
  operation: Operation;
  answer: number;
  startTime: number; // useful for analytics later
}

export const generateQuestion = (ops: Operation[] = ['+', '-', '*', '/']): Question => {
  const op = ops[Math.floor(Math.random() * ops.length)];
  let num1 = 0;
  let num2 = 0;
  let answer = 0;

  switch (op) {
    case '+':
      // 2..100 + 2..100
      num1 = Math.floor(Math.random() * 99) + 2;
      num2 = Math.floor(Math.random() * 99) + 2;
      answer = num1 + num2;
      break;
    case '-':
      // Result 2..100, num2 2..100. So num1 = res + num2
      answer = Math.floor(Math.random() * 99) + 2;
      num2 = Math.floor(Math.random() * 99) + 2;
      num1 = answer + num2;
      break;
    case '*':
      // 2..12 * 2..100
      num1 = Math.floor(Math.random() * 11) + 2; // 2-12
      num2 = Math.floor(Math.random() * 99) + 2; // 2-100
      answer = num1 * num2;
      break;
    case '/':
      // Result 2..100, divisor 2..12
      answer = Math.floor(Math.random() * 99) + 2;
      num2 = Math.floor(Math.random() * 11) + 2; // 2-12
      num1 = answer * num2;
      break;
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

export const checkAnswer = (question: Question, input: string): boolean => {
  const inputNum = parseInt(input, 10);
  return !isNaN(inputNum) && inputNum === question.answer;
};
