import {
  ASTBase,
  ASTParenthesisExpression
} from 'miniscript-core';

export function unwrap(node: ASTBase) {
  while (node instanceof ASTParenthesisExpression) {
    node = node.expression;
  }
  return node;
}