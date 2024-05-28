import {
  ASTAssignmentStatement,
  ASTBase,
  ASTBaseBlock,
  ASTEvaluationExpression,
  ASTIdentifier,
  ASTMemberExpression,
  Operator
} from 'miniscript-core';

const SHORTHAND_OPERATORS = [
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

export const processBlock = (
  block: ASTBaseBlock,
  process: (item: ASTBase) => string
): string[] => {
  const body: string[] = [];
  let index = block.start.line + 1;
  let bodyItem;

  for (bodyItem of block.body) {
    for (; index < bodyItem.start.line; index++) {
      body.push('');
    }

    body.push(process(bodyItem));
    index = bodyItem.end.line + 1;
  }

  for (; index < block.end.line; index++) {
    body.push('');
  }

  return body;
};

export const isShorthandAssignmentWithIdentifier = (
  item: ASTAssignmentStatement
) => {
  const varibale = item.variable;
  const init = item.init;
  return (
    varibale instanceof ASTIdentifier &&
    init instanceof ASTEvaluationExpression &&
    init.left instanceof ASTIdentifier &&
    varibale.name === init.left.name &&
    SHORTHAND_OPERATORS.includes(init.operator)
  );
};

export const isShorthandAssignmentWithMemberExpression = (
  item: ASTAssignmentStatement
) => {
  const varibale = item.variable;
  const init = item.init;
  return (
    varibale instanceof ASTMemberExpression &&
    init instanceof ASTEvaluationExpression &&
    init.left instanceof ASTMemberExpression &&
    SHORTHAND_OPERATORS.includes(init.operator)
  );
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
