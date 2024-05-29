import { ASTEvaluationExpression, Operator } from 'miniscript-core';

export const SHORTHAND_OPERATORS = [
  Operator.Plus,
  Operator.Minus,
  Operator.Asterik,
  Operator.Slash,
  Operator.Modulo,
  Operator.Power
] as string[];

export const countEvaluationExpressions = (
  item: ASTEvaluationExpression
): number => {
  const queue = [item];
  let count = 0;

  while (queue.length > 0) {
    const current = queue.pop();

    if (current.left instanceof ASTEvaluationExpression)
      queue.push(current.left);
    if (current.right instanceof ASTEvaluationExpression)
      queue.push(current.right);
    count++;
  }

  return count;
};

export const transformBitOperation = (
  expression: string,
  left: string,
  right: string,
  operator: string
): string => {
  if (operator === '|') {
    return 'bitOr(' + [left, right].join(', ') + ')';
  } else if (operator === '&') {
    return 'bitAnd(' + [left, right].join(', ') + ')';
  } else if (operator === '<<' || operator === '>>' || operator === '>>>') {
    throw new Error('Operators in binary expression are not supported');
  }

  return expression;
};
