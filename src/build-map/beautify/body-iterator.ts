import { ASTBase, ASTType } from 'miniscript-core';

import {
  getBlockCloseEndLine,
  getBlockOpenerEndLine,
  getPreviousEndLine
} from './block-helpers';

export const FILLER_TYPE = 'FILLER' as unknown as ASTType;

function makeFiller(line: number, base: ASTBase): ASTBase {
  const pos = { line, character: 0 };
  return new ASTBase(FILLER_TYPE, {
    start: pos,
    end: pos,
    range: [0, 0],
    scope: base.scope
  });
}

export function* iterateBody<T extends ASTBase>(
  base: ASTBase,
  items: T[]
): Generator<T | ASTBase> {
  let lastEndLine = getBlockOpenerEndLine(base);

  for (const item of items) {
    const gap = Math.max(item.start.line - lastEndLine - 1, 0);
    for (let i = 0; i < gap; i++) {
      yield makeFiller(lastEndLine + i + 1, base);
    }
    yield item;
    lastEndLine = getPreviousEndLine(item);
  }

  // Trailing gap: blank lines between last item and block close
  const tailGap = Math.max(getBlockCloseEndLine(base) - lastEndLine - 1, 0);
  for (let i = 0; i < tailGap; i++) {
    yield makeFiller(lastEndLine + i + 1, base);
  }
}
