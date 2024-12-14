
import {
  ASTBase,
  ASTForGenericStatement,
  ASTIfClause,
  ASTIfStatement,
  ASTType,
  ASTWhileStatement
} from 'miniscript-core';

export const FILLER_TYPE = 'FILLER' as unknown as ASTType;

export class BeautifyBodyIterator<T extends ASTBase = ASTBase> implements Iterator<T> {
  private _base: ASTBase;
  private _items: T[];
  private _index: number;
  private _freeSpaceIndex: number;
  private _freeSpace: number;
  private _checkedIndexes: Set<number>;
  private _lastEndLine: number;
  private _previous: T | null;

  constructor(
    base: ASTBase,
    items: T[]
  ) {
    this._base = base;
    this._items = items.sort((a, b) => a.range[0] - b.range[0]);
    this._index = 0;
    this._freeSpaceIndex = 0;
    this._freeSpace = 0;
    this._lastEndLine = 0;
    this._checkedIndexes = new Set();
    this._previous = null;
  }

  private getBlockOpenerEndLine(item: ASTBase): number {
    switch (item.type) {
      case ASTType.IfClause:
        return (item as ASTIfClause).condition.end.line;
      case ASTType.WhileStatement:
        return (item as ASTWhileStatement).condition.end.line;
      case ASTType.ForGenericStatement:
        return (item as ASTForGenericStatement).iterator.end.line;
      case ASTType.Chunk:
        return item.start.line - 1;
    }

    return item.start.line;
  }

  private getBlockCloseEndLine(item: ASTBase): number {
    switch (item.type) {
      case ASTType.Chunk:
        return item.end.line + 1;
    }

    return item.end.line;
  }

  private getPreviousEndLine(item: ASTBase): number {
    if (item == null) {
      return 0;
    } else if (item.type === ASTType.IfShortcutStatement) {
      const ifShortcut = item as ASTIfStatement;
      return ifShortcut.clauses[ifShortcut.clauses.length - 1].body[0].end.line;
    }

    return item.end.line;
  }

  private getFreeSpaceItem(): T {
    const pos = {
      line: this._lastEndLine + this._freeSpaceIndex + 1,
      character: 0
    };

    this._freeSpaceIndex++;

    if (this._freeSpace === this._freeSpaceIndex) {
      this._lastEndLine = 0;
      this._freeSpaceIndex = 0;
      this._freeSpace = 0;
    }

    return new ASTBase(FILLER_TYPE, {
      start: pos,
      end: pos,
      range: [0, 0],
      scope: this._base.scope
    }) as T;
  }


  next(): IteratorResult<T> {
    if (this._freeSpace > this._freeSpaceIndex) {
      return {
        value: this.getFreeSpaceItem(),
        done: false
      };
    }

    if (this._index >= this._items.length) {
      if (!this._checkedIndexes.has(this._items.length)) {
        const last = this._items[this._items.length - 1];
        const lastEndLine = this.getPreviousEndLine(last);
        const size = Math.max(
          this.getBlockCloseEndLine(this._base) - lastEndLine - 1,
          0
        );

        if (size > 0) {
          this._checkedIndexes.add(this._items.length);
          this._lastEndLine = lastEndLine;
          this._freeSpace = size;
          return {
            value: this.getFreeSpaceItem(),
            done: false
          };
        }
      }

      return {
        value: null,
        done: true
      };
    }

    const bodyItem = this._items[this._index];

    if (!this._checkedIndexes.has(this._index)) {
      const lastEndLine = this._previous
        ? this.getPreviousEndLine(this._previous)
        : this.getBlockOpenerEndLine(this._base);
      const diff = Math.max(bodyItem.start.line - lastEndLine - 1, 0);

      if (diff > 0) {
        this._checkedIndexes.add(this._index);
        this._lastEndLine = lastEndLine;
        this._freeSpace = diff;
        return {
          value: this.getFreeSpaceItem(),
          done: false
        };
      }
    }

    this._index++;
    this._previous = bodyItem;

    return {
      value: bodyItem,
      done: false
    };
  }
}