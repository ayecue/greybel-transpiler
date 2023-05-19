import { ASTImportCodeExpression } from 'greyscript-core';

import { Context } from '../context';
import { Dependency, DependencyRef } from '../dependency';

export function injectImport(
  context: Context,
  item: ASTImportCodeExpression
): string {
  const astRefDependencyMap = context.data.get('astRefDependencyMap') as Map<
    DependencyRef,
    {
      main: Dependency;
      imports: Set<Dependency>;
    }
  >;

  if (!astRefDependencyMap) {
    return `import_code("${item.directory}")`;
  }

  const astRefsVisited = context.getOrCreateData<Set<Dependency>>(
    'astRefsVisited',
    () => new Set()
  );

  if (astRefDependencyMap.has(item)) {
    const lines = [];
    const entry = astRefDependencyMap.get(item);

    for (const importEntry of entry.imports) {
      if (astRefsVisited.has(importEntry)) continue;
      if (importEntry.ref instanceof ASTImportCodeExpression) {
        lines.unshift(`import_code("${importEntry.target}")`);
      }

      astRefsVisited.add(importEntry);
    }

    lines.push(`import_code("${entry.main.target}")`);

    return lines.join('\n');
  }

  return '';
}
