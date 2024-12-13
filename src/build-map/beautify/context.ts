import {
  ASTBase,
  ASTBaseBlock,
  ASTChunk,
  ASTComment,
  ASTForGenericStatement,
  ASTIfClause,
  ASTIfStatement,
  ASTType,
  ASTWhileStatement
} from 'miniscript-core';

import { DefaultFactoryOptions, Factory } from '../factory';
import { BeautifyBodyIterator, FILLER_TYPE } from './body-iterator';

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

interface ChunkContext {
  commentBuckets: Map<number, ASTComment[]>
}

export class BeautifyContext {
  readonly options: BeautifyContextOptions;

  private factory: Factory<Partial<BeautifyContextOptions>>;
  private _indent: number;
  private _isMultilineAllowed: boolean;
  private _stack: ASTChunk[];
  private _contexts: Map<ASTChunk, ChunkContext>;

  public getIndent: (offset?: number) => string;

  get indent() {
    return this._indent;
  }

  get isMultilineAllowed() {
    return this._isMultilineAllowed;
  }

  constructor(
    factory: Factory<Partial<BeautifyContextOptions>>,
    options: BeautifyContextOptions
  ) {
    this.factory = factory;
    this.options = options;
    this._indent = 0;
    this._stack = [];
    this._contexts = new Map();
    this._isMultilineAllowed = true;
    this.getIndent =
      options.indentation === IndentationType.Tab
        ? (offset: number = 0) => '\t'.repeat(this._indent + offset)
        : (offset: number = 0) =>
            ' '.repeat(options.indentationSpaces).repeat(this._indent + offset);
  }

  private buildChunkContext(chunk: ASTChunk): ChunkContext {
    const commentBuckets: Map<number, ASTComment[]> = new Map();
    const lineIdxs = Object.keys(chunk.lines);

    for (const idx of lineIdxs) {
      const nr = Number(idx);
      const line = chunk.lines[nr];
      const comments = line.filter((it) => it.type === ASTType.Comment) as ASTComment[];

      if (!commentBuckets.has(nr)) {
        commentBuckets.set(nr, []);
      }

      commentBuckets.get(nr).push(...comments);
    }

    return {
      commentBuckets
    };
  }

  getChunkContext(chunk: ASTChunk): ChunkContext {
    return this._contexts.get(chunk);
  }

  getCurrentChunk() {
    return this._stack[this._stack.length - 1];
  }

  pushStack(chunk: ASTChunk) {
    this._stack.push(chunk);
    this._contexts.set(chunk, this.buildChunkContext(chunk));
  }

  popStack() {
    this._stack.pop();
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

  buildBlock(block: ASTBaseBlock): void {
    if (block.body.length === 0) return;

    const iterator = new BeautifyBodyIterator(block, block.body);
    let next = iterator.next();

    while (!next.done) {
      const current = next.value;
      const startIndex = this.factory.lines.length;

      if (current.type === FILLER_TYPE) {
        this.factory.pushSegment(this.getIndent());
        this.factory.pushComment(current.start.line);
        this.factory.eol();
        next = iterator.next();
        continue;
      }

      this.factory.process(current, {
        isCommand: true
      });
      if (startIndex < this.factory.lines.length) {
        this.factory.lines[startIndex].segments.unshift(this.getIndent());
        this.factory.eol();
      }
      next = iterator.next();
    }
  }
}
