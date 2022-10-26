import { ASTBaseBlockWithScope, ASTChunk } from 'greyscript-core';

export default function (chunk: ASTChunk): string[] {
  const allNamespaces = new Set<string>(chunk.namespaces);

  chunk.scopes.reduce((result: Set<string>, scope: ASTBaseBlockWithScope) => {
    scope.namespaces.forEach((item: string) => allNamespaces.add(item));
    return result;
  }, allNamespaces);

  return Array.from(allNamespaces);
}
