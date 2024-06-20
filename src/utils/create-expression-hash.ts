import {
  ASTBase,
  ASTIdentifier,
  ASTIndexExpression,
  ASTMemberExpression,
  ASTParenthesisExpression,
  ASTType
} from 'miniscript-core';

import { getStringHashCode } from './hash';

const attachCache = (c: any, h: number): number => (c.$$hash = h);
const retreiveCache = (c: any): number | null => c.$$hash ?? null;

function hashHandler(current: ASTBase): number {
  const cachedHash = retreiveCache(current);
  if (cachedHash !== null) return cachedHash;

  let result = getStringHashCode(current.type);

  switch (current.type) {
    case ASTType.ParenthesisExpression: {
      const parenExpr = current as ASTParenthesisExpression;
      return hashHandler(parenExpr.expression);
    }
    case ASTType.MemberExpression: {
      const memberExpr = current as ASTMemberExpression;
      result ^= hashHandler(memberExpr.base);
      result ^= hashHandler(memberExpr.identifier);
      return attachCache(current, result);
    }
    case ASTType.IndexExpression: {
      const indexExpr = current as ASTIndexExpression;
      result ^= hashHandler(indexExpr.base);
      result ^= hashHandler(indexExpr.index);
      return attachCache(current, result);
    }
    case ASTType.Identifier: {
      const identifier = current as ASTIdentifier;
      result ^= getStringHashCode(identifier.name);
      return attachCache(current, result);
    }
  }

  return attachCache(current, result);
}

export function createExpressionHash(item: ASTBase): number {
  return hashHandler(item);
}
