import {
  ASTBase,
  ASTBinaryExpression,
  ASTClause,
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
  Operator.Asterisk,
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

export const unwrap = (node: ASTBase): ASTBase => {
  while (node instanceof ASTParenthesisExpression) {
    node = node.expression;
  }
  return node;
};

export const containsMultilineItemInShortcutClauses = (
  startLine: number,
  clauses: ASTClause[]
) => {
  return clauses.some((it) => startLine < it.body[0].endLine);
};

export const hasEmptyBody = (body: ASTBase[]) => {
  return !body.some((it) => it.type !== ASTType.NoopStatement);
};

export const commentToText = (value: string, isDevMode: boolean): string => {
  const isMultiline = value.indexOf('\n') !== -1;
  const trimmed = value.trim();

  if (isMultiline) {
    if (!isDevMode) {
      // Convert block comment to multiple // lines
      const lines = trimmed.split('\n');
      return lines
        .map((line) => {
          const l = line.trim();
          return l.length > 0 ? '// ' + l : '//';
        })
        .join('\n');
    }

    // Dev mode: preserve /* */ syntax
    return '/* ' + trimmed + ' */';
  }

  return trimmed.length > 0 ? '// ' + trimmed : '//';
};
