import { ASTImportCodeExpression } from 'greyscript-core';

import Context from '../context';
import Dependency from '../dependency';

export default function (
  context: Context,
  item: ASTImportCodeExpression
): string {
  const astDepMap = context.data.get('astDepMap');

  if (!astDepMap) {
    return `import_code("${item.gameDirectory}")`;
  }

  const depsUsed = context.getOrCreateData<Set<Dependency>>(
    'depsUsed',
    () => new Set()
  );

  if (astDepMap.has(item)) {
    const lines = [];
    const subDeps = astDepMap.get(item);

    for (const subDep of subDeps) {
      if (depsUsed.has(subDep)) continue;

      lines.unshift(`import_code("${subDep.ref.gameDirectory}")`);
      depsUsed.add(subDep);
    }

    lines.push(`import_code("${item.gameDirectory}")`);

    return lines.join('\n');
  }

  return '';
}
