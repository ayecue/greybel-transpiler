import {
  ASTBase,
  ASTComment,
  ASTEvaluationExpression,
  ASTParenthesisExpression,
  ASTType,
  Operator
} from 'miniscript-core';

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

export const unwrap = (node: ASTBase): ASTBase => {
  while (node instanceof ASTParenthesisExpression) {
    node = node.expression;
  }
  return node;
};

export const getLastComment = (nodes: ASTBase[]): ASTComment | null => {
  for (let i = nodes.length - 1; i >= 0; i--) {
    const node = nodes[i];
    if (node.type === ASTType.Comment) return node as ASTComment;
  }
  return null;
};
