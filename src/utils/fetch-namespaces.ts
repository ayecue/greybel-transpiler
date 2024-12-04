import {
  ASTBaseBlockWithScope,
  ASTChunk,
  ASTIdentifier,
  ASTMemberExpression,
  ASTScopeNamespace,
  ASTType
} from 'miniscript-core';

function transformNamespaceToString(
  namespace: ASTScopeNamespace
): string | null {
  if (namespace.type === ASTType.MemberExpression) {
    const memberExpr = namespace as ASTMemberExpression;
    if (memberExpr.identifier.type === ASTType.Identifier) {
      return (memberExpr.identifier as ASTIdentifier).name;
    }
    return null;
  } else if (namespace.type === ASTType.Identifier) {
    return (namespace as ASTIdentifier).name;
  }
  return null;
}

export function fetchNamespaces(chunk: ASTChunk): string[] {
  const allNamespaces = new Set<string>(
    chunk.namespaces.map(transformNamespaceToString).filter((it) => it !== null)
  );

  chunk.scopes.reduce((result: Set<string>, scope: ASTBaseBlockWithScope) => {
    const scopeNamespaces = scope.namespaces
      .map(transformNamespaceToString)
      .filter((it) => it !== null);
    scopeNamespaces.forEach((item: string) => allNamespaces.add(item));
    return result;
  }, allNamespaces);

  return Array.from(allNamespaces);
}
