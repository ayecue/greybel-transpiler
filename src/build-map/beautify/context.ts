import {
  ASTBase,
  ASTBaseBlock,
  ASTChunk,
  ASTForGenericStatement,
  ASTIfClause,
  ASTIfStatement,
  ASTType,
  ASTWhileStatement
} from 'miniscript-core';

import { DefaultFactoryOptions, Factory, TokenType } from '../factory';

export enum IndentationType {
  Tab,
  Whitespace
}

export interface BeautifyContextOptions extends DefaultFactoryOptions {
  keepParentheses: boolean;
  indentation: IndentationType;
  indentationSpaces: number;
  isDevMode: boolean;
}

export class BeautifyContext {
  readonly options: BeautifyContextOptions;

  private factory: Factory<Partial<BeautifyContextOptions>>;
  private _indent: number;
  private _isMultilineAllowed: boolean;
  private _usedComments: Set<ASTBase>;
  public getIndent: (offset?: number) => string;

  get indent() {
    return this._indent;
  }

  get isMultilineAllowed() {
    return this._isMultilineAllowed;
  }

  get usedComments() {
    return this._usedComments;
  }

  constructor(
    factory: Factory<Partial<BeautifyContextOptions>>,
    options: BeautifyContextOptions
  ) {
    this.factory = factory;
    this.options = options;
    this._indent = 0;
    this._isMultilineAllowed = true;
    this._usedComments = new Set();
    this.getIndent =
      options.indentation === IndentationType.Tab
        ? (offset: number = 0) => '\t'.repeat(this._indent + offset)
        : (offset: number = 0) =>
            ' '.repeat(options.indentationSpaces).repeat(this._indent + offset);
  }

  disableMultiline() {
    this._isMultilineAllowed = false;
  }

  enableMultiline() {
    this._isMultilineAllowed = true;
  }

  incIndent() {
    this._indent++;
  }

  decIndent() {
    this._indent--;
  }

  getBlockOpenerEndLine(block: ASTBaseBlock): number {
    if (block instanceof ASTIfClause) {
      return block.condition.end.line;
    } else if (block instanceof ASTWhileStatement) {
      return block.condition.end.line;
    } else if (block instanceof ASTForGenericStatement) {
      return block.iterator.end.line;
    } else if (block instanceof ASTChunk) {
      return block.start.line - 1;
    }

    return block.start.line;
  }

  getPreviousEndLine(item: ASTBase): number {
    if (item == null) {
      return 0;
    } else if (item.type === ASTType.IfShortcutStatement) {
      const ifShortcut = item as ASTIfStatement;
      return ifShortcut.clauses[ifShortcut.clauses.length - 1].body[0].end.line;
    }

    return item.end.line;
  }

  containsNewLineInRange(
    start: number,
    end: number = this.factory.tokens.length
  ) {
    const max = Math.min(end, this.factory.tokens.length);

    for (let index = start; index < max; index++) {
      if (this.factory.tokens[index].type === TokenType.EndOfLine) {
        return true;
      }
    }

    return false;
  }

  buildBlock(block: ASTBaseBlock): void {
    if (block.body.length === 0) return;

    block.body.sort((a, b) => a.range[0] - b.range[0]);

    let previous: ASTBase | null = null;

    for (let index = 0; index < block.body.length; index++) {
      const bodyItem = block.body[index];
      const lastEndLine = previous
        ? this.getPreviousEndLine(previous)
        : this.getBlockOpenerEndLine(block);
      const diff = Math.max(bodyItem.start.line - lastEndLine - 1, 0);

      if (diff > 0) {
        for (let j = 0; j < diff; j++) {
          const pos = {
            line: lastEndLine + j + 1,
            character: 0
          };
          this.factory.tokens.push({
            type: TokenType.EndOfLine,
            value: '\n',
            ref: {
              start: pos,
              end: pos
            }
          });
        }
      }

      const startIndex = this.factory.tokens.length;
      this.factory.process(bodyItem, {
        isCommand: true
      });
      if (startIndex < this.factory.tokens.length) {
        this.factory.tokens[startIndex].value =
          this.getIndent() + this.factory.tokens[startIndex].value;
        this.factory.tokens.push({
          type: TokenType.EndOfLine,
          value: '\n',
          ref: {
            start: bodyItem.end,
            end: bodyItem.end
          }
        });
      }

      previous = bodyItem;
    }

    const last = block.body[block.body.length - 1];
    const size = Math.max(
      block.end.line - this.getPreviousEndLine(last) - 1,
      0
    );

    if (size > 0) {
      for (let j = 0; j < size; j++) {
        const pos = {
          line: last.end.line + j + 1,
          character: 0
        };
        this.factory.tokens.push({
          type: TokenType.EndOfLine,
          value: '\n',
          ref: {
            start: pos,
            end: pos
          }
        });
      }
    }
  }
}
