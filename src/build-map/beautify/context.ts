import {
  ASTBase,
  ASTBaseBlock,
  ASTChunk,
  ASTComment,
  ASTForGenericStatement,
  ASTIfClause,
  ASTIfStatement,
  ASTPosition,
  ASTType,
  ASTWhileStatement
} from 'miniscript-core';

import { TransformerLike } from '../../types/transformer';
import { DefaultFactoryOptions } from '../factory';
import { getLastComment } from './utils';

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

  private transformer: TransformerLike<BeautifyContextOptions>;
  private _indent: number;
  private _isMultilineAllowed: boolean;
  private chunks: ASTChunk['lines'][];
  private usedComments: Set<ASTBase>;
  public putIndent: (str: string, offset?: number) => string;

  get indent() {
    return this._indent;
  }

  get isMultilineAllowed() {
    return this._isMultilineAllowed;
  }

  constructor(
    transformer: TransformerLike<BeautifyContextOptions>,
    options: BeautifyContextOptions
  ) {
    this.transformer = transformer;
    this.options = options;
    this._indent = 0;
    this._isMultilineAllowed = true;
    this.chunks = [];
    this.usedComments = new Set();
    this.putIndent =
      options.indentation === IndentationType.Tab
        ? (str: string, offset: number = 0) =>
            `${'\t'.repeat(this._indent + offset)}${str}`
        : (str: string, offset: number = 0) =>
            `${' '
              .repeat(options.indentationSpaces)
              .repeat(this._indent + offset)}${str}`;
  }

  pushLines(lines: ASTChunk['lines']) {
    this.chunks.push(lines);
  }

  popLines(): ASTChunk['lines'] {
    return this.chunks.pop();
  }

  getLines(): ASTChunk['lines'] {
    return this.chunks[this.chunks.length - 1];
  }

  useComment(position: ASTPosition, leftPadding: string = ' '): string {
    const items = this.getLines()[position.line];
    if (items == null) return '';
    const lastItem = getLastComment(items);

    if (lastItem != null && !this.usedComments.has(lastItem)) {
      this.usedComments.add(lastItem);
      return leftPadding + this.transformer.make(lastItem);
    }

    return '';
  }

  appendComment(position: ASTPosition, line: string): string {
    return line + this.useComment(position);
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

  buildBlock(block: ASTBaseBlock): string[] {
    if (block.body.length === 0) return [];

    const sortedBody = [...block.body].sort(
      (a, b) => a.start.line - b.start.line
    );
    const body: string[] = [];
    let previous: ASTBase | null = null;

    for (let index = 0; index < sortedBody.length; index++) {
      const bodyItem = sortedBody[index];
      const next = sortedBody[index + 1] ?? null;

      if (
        bodyItem.type !== ASTType.Comment &&
        previous?.end.line === bodyItem.start.line
      ) {
        const transformed = this.transformer.make(bodyItem, {
          isCommand: true
        });
        body.push(
          this.putIndent(this.appendComment(bodyItem.end, transformed))
        );
        previous = bodyItem;
        continue;
      }

      if (this.usedComments.has(bodyItem)) {
        const comment = bodyItem as ASTComment;
        if (comment.isMultiline) previous = bodyItem;
        continue;
      }

      if (
        bodyItem.type === ASTType.Comment &&
        bodyItem.start.line === next?.start.line
      ) {
        continue;
      }

      const diff = Math.max(
        previous
          ? bodyItem.start.line - this.getPreviousEndLine(previous) - 1
          : bodyItem.start.line - this.getBlockOpenerEndLine(block) - 1,
        0
      );

      if (diff > 0) {
        body.push(...new Array(diff).fill(''));
      }

      if (bodyItem instanceof ASTComment) {
        this.usedComments.add(bodyItem);
        const transformed = this.transformer.make(bodyItem, {
          isCommand: true
        });
        body.push(this.putIndent(transformed));
      } else {
        const transformed = this.transformer.make(bodyItem, {
          isCommand: true
        });
        body.push(
          this.putIndent(this.appendComment(bodyItem.end, transformed))
        );
      }

      previous = bodyItem;
    }

    const last = block.body[block.body.length - 1];
    const size = Math.max(
      block.end.line - this.getPreviousEndLine(last) - 1,
      0
    );

    if (size > 0) {
      body.push(...new Array(size).fill(''));
    }

    return body;
  }
}
