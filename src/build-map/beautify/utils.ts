import {
  ASTBase,
  ASTBinaryExpression,
  ASTComment,
  ASTComparisonGroupExpression,
  ASTIsaExpression,
  ASTLogicalExpression,
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

export const countRightBinaryExpressions = (item: ASTBase): number => {
  item = unwrap(item);

  if (item instanceof ASTComparisonGroupExpression) {
    return item.expressions.length;
  }

  const queue = [item];
  let count = 0;

  while (queue.length > 0) {
    const current = queue.pop();
    if (current instanceof ASTBinaryExpression) {
      count++;
    }
    if (
      current instanceof ASTBinaryExpression ||
      current instanceof ASTLogicalExpression ||
      current instanceof ASTIsaExpression
    ) {
      queue.push(unwrap(current.left));
      queue.push(unwrap(current.right));
    }
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
