import {
  ASTBase,
  ASTIdentifier,
  ASTIndexExpression,
  ASTMemberExpression,
  ASTParenthesisExpression,
  ASTType
} from 'miniscript-core';

function exprStringHandler(current: ASTBase): string {
  switch (current.type) {
    case ASTType.ParenthesisExpression: {
      const parenExpr = current as ASTParenthesisExpression;
      return exprStringHandler(parenExpr.expression);
    }
    case ASTType.MemberExpression: {
      const memberExpr = current as ASTMemberExpression;
      return `${exprStringHandler(memberExpr.base)}.${exprStringHandler(
        memberExpr.identifier
      )}`;
    }
    case ASTType.IndexExpression: {
      const indexExpr = current as ASTIndexExpression;
      return `${exprStringHandler(indexExpr.base)}[]`;
    }
    case ASTType.Identifier: {
      const identifier = current as ASTIdentifier;
      return identifier.name;
    }
  }

  return undefined;
}

export function createExpressionString(item: ASTBase): string {
  return exprStringHandler(item);
}
