import type { Operation } from './mathEngine';

export type Category = 
  | 'add_basic' | 'add_2digit' | 'add_3digit'
  | 'sub_basic' | 'sub_2digit' | 'sub_3digit'
  | 'mult_2' | 'mult_3' | 'mult_4' | 'mult_5' | 'mult_6' | 'mult_7' | 'mult_8' | 'mult_9' | 'mult_10' | 'mult_11' | 'mult_12'
  | 'mult_table' | 'mult_2digit' | 'mult_3digit'
  | 'div_2' | 'div_3' | 'div_4' | 'div_5' | 'div_6' | 'div_7' | 'div_8' | 'div_9' | 'div_10' | 'div_11' | 'div_12'
  | 'div_table' | 'div_long'
  | 'other';

export const categorizeQuestion = (num1: number, num2: number, op: Operation): Category[] => {
  const cats: Category[] = [];

  switch (op) {
    case '+':
      if (num1 < 10 && num2 < 10) cats.push('add_basic');
      else if (num1 < 100 && num2 < 100) cats.push('add_2digit');
      else cats.push('add_3digit');
      break;
    case '-':
      if (num1 < 20 && num2 < 10) cats.push('sub_basic');
      else if (num1 < 100 && num2 < 100) cats.push('sub_2digit');
      else cats.push('sub_3digit');
      break;
    case '*':
      if (num1 >= 2 && num1 <= 12) cats.push(`mult_${num1}` as Category);
      if (num2 >= 2 && num2 <= 12) cats.push(`mult_${num2}` as Category);
      
      if (cats.length === 0) {
        if (num1 < 100 && num2 < 100) cats.push('mult_2digit');
        else cats.push('mult_3digit');
      }
      break;
    case '/':
      if (num2 >= 2 && num2 <= 12) cats.push(`div_${num2}` as Category);
      
      if (cats.length === 0) {
        if (num1 / num2 <= 12) cats.push('div_table');
        else cats.push('div_long');
      }
      break;
  }

  return cats.length > 0 ? cats : ['other'];
};

export const getCategoryLabel = (category: string): string => {
  // Handle dynamic traits like "* 13", "+ 15", "/ 7"
  const traitMatch = category.match(/^([\+\-\*\/])\s*(\d+)$/);
  if (traitMatch) {
    const [_, op, num] = traitMatch;
    const opNames: Record<string, string> = {
      '+': 'Adding',
      '-': 'Subtracting',
      '*': 'Multiplying',
      '/': 'Dividing'
    };
    const prep: Record<string, string> = {
      '+': 'by',
      '-': 'by',
      '*': 'by',
      '/': 'by'
    };
    return `${opNames[op]} ${prep[op]} ${num}`;
  }

  const labels: Record<string, string> = {
    add_basic: 'Basic Addition',
    add_2digit: '2-Digit Addition',
    add_3digit: '3-Digit Addition',
    sub_basic: 'Basic Subtraction',
    sub_2digit: '2-Digit Subtraction',
    sub_3digit: '3-Digit Subtraction',
    
    mult_2: 'Multiplying by 2',
    mult_3: 'Multiplying by 3',
    mult_4: 'Multiplying by 4',
    mult_5: 'Multiplying by 5',
    mult_6: 'Multiplying by 6',
    mult_7: 'Multiplying by 7',
    mult_8: 'Multiplying by 8',
    mult_9: 'Multiplying by 9',
    mult_10: 'Multiplying by 10',
    mult_11: 'Multiplying by 11',
    mult_12: 'Multiplying by 12',
    
    mult_table: 'Multiplication Tables',
    mult_2digit: '2-Digit Multiplication',
    mult_3digit: '3-Digit Multiplication',
    
    div_2: 'Dividing by 2',
    div_3: 'Dividing by 3',
    div_4: 'Dividing by 4',
    div_5: 'Dividing by 5',
    div_6: 'Dividing by 6',
    div_7: 'Dividing by 7',
    div_8: 'Dividing by 8',
    div_9: 'Dividing by 9',
    div_10: 'Dividing by 10',
    div_11: 'Dividing by 11',
    div_12: 'Dividing by 12',

    div_table: 'Division Tables',
    div_long: 'Complex Division',
    other: 'General Math'
  };
  return labels[category] || category;
};
