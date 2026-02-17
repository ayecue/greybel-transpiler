import {
  ASTBase,
  ASTForGenericStatement,
  ASTIfClause,
  ASTIfStatement,
  ASTType,
  ASTWhileStatement
} from 'miniscript-core';

export function getBlockOpenerEndLine(block: ASTBase): number {
  switch (block.type) {
    case ASTType.IfClause:
    case ASTType.ElseifClause:
      return (block as ASTIfClause).condition.end.line;
    case ASTType.WhileStatement:
      return (block as ASTWhileStatement).condition.end.line;
    case ASTType.ForGenericStatement:
      return (block as ASTForGenericStatement).iterator.end.line;
    case ASTType.Chunk:
      return block.start.line - 1;
  }

  return block.start.line;
}

export function getBlockCloseEndLine(block: ASTBase): number {
  if (block.type === ASTType.Chunk) {
    return block.end.line + 1;
  }
  return block.end.line;
}

export function getPreviousEndLine(item: ASTBase): number {
  if (item == null) {
    return 0;
  }
  if (item.type === ASTType.IfShortcutStatement) {
    const ifShortcut = item as ASTIfStatement;
    return ifShortcut.clauses[ifShortcut.clauses.length - 1].body[0].end.line;
  }
  return item.end.line;
}
