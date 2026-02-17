import {
  ASTBase,
  ASTBaseBlock,
  ASTChunk
} from 'miniscript-core';

import { DefaultFactoryOptions, Factory } from '../factory';
import { iterateBody, FILLER_TYPE } from './body-iterator';
import {
  processComments,
  CommentAttachmentResult,
  CommentNode
} from './comment-attach';

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

export interface ChunkContext {
  /** The full result from processComments */
  result: CommentAttachmentResult;
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

  /**
   * Builds the chunk context by running the hybrid comment attachment algorithm.
   */
  private buildChunkContext(chunk: ASTChunk): ChunkContext {
    return {
      result: processComments(chunk)
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

  /**
   * Get leading comments structurally attached to a body item.
   */
  getLeadingComments(node: ASTBase): CommentNode[] {
    const chunk = this.getCurrentChunk();
    const ctx = this.getChunkContext(chunk);
    if (!ctx) return [];
    return ctx.result.leadingComments.get(node) || [];
  }

  /**
   * Get dangling comments for a block (empty blocks or after last body item).
   */
  getDanglingComments(block: ASTBaseBlock): CommentNode[] {
    const chunk = this.getCurrentChunk();
    const ctx = this.getChunkContext(chunk);
    if (!ctx) return [];
    return ctx.result.danglingComments.get(block) || [];
  }

  /**
   * Consume trailing comments for a source line number.
   * Returns the comments and removes them from the bucket (single-use).
   */
  consumeTrailingBucket(lineNr: number): CommentNode[] | undefined {
    const chunk = this.getCurrentChunk();
    const ctx = this.getChunkContext(chunk);
    if (!ctx) return undefined;
    const comments = ctx.result.trailingBuckets.get(lineNr);
    if (comments) {
      ctx.result.trailingBuckets.delete(lineNr);
    }
    return comments;
  }

  consumeBeforeBucket(lineNr: number): CommentNode[] | undefined {
    const chunk = this.getCurrentChunk();
    const ctx = this.getChunkContext(chunk);
    if (!ctx) return undefined;
    const comments = ctx.result.beforeBuckets.get(lineNr);
    if (comments) {
      ctx.result.beforeBuckets.delete(lineNr);
    }
    return comments;
  }

  buildBlock(block: ASTBaseBlock): void {
    const danglingComments = this.getDanglingComments(block);

    // Empty block with dangling comments
    if (block.body.length === 0 && danglingComments.length > 0) {
      this.factory.emitCommentLines(danglingComments, this.getIndent());
      return;
    }

    let pendingFillers = 0;
    let pendingFillerComments: CommentNode[] = [];

    for (const current of iterateBody(block, block.body)) {
      if (current.type === FILLER_TYPE) {
        pendingFillers++;

        const beforeComments = this.consumeBeforeBucket(
          current.start.line
        );
        if (beforeComments && beforeComments.length > 0) {
          pendingFillerComments.push(...beforeComments);
        }
        const trailingComments = this.consumeTrailingBucket(
          current.start.line
        );
        if (trailingComments && trailingComments.length > 0) {
          pendingFillerComments.push(...trailingComments);
        }

        continue;
      }

      // Current is a real body item — flush pending fillers
      const leadingComments = this.getLeadingComments(current);
      const commentLineCount =
        leadingComments.length + pendingFillerComments.length;
      const blanks = Math.max(pendingFillers - commentLineCount, 0);

      for (let i = 0; i < blanks; i++) {
        this.factory.pushSegment(this.getIndent());
        this.factory.eol();
      }

      // Emit filler-carried comments (multiline segments on blank lines)
      if (pendingFillerComments.length > 0) {
        this.factory.emitCommentLines(
          pendingFillerComments,
          this.getIndent()
        );
        pendingFillerComments = [];
      }

      // Emit structural leading comments
      if (leadingComments.length > 0) {
        this.factory.emitCommentLines(leadingComments, this.getIndent());
      }

      pendingFillers = 0;

      // Process the body item itself
      this.factory.pushSegment(this.getIndent());
      this.factory.process(current, {
        isCommand: true
      });
      this.factory.eol();
    }

    // Handle trailing fillers (blank lines before block-end keyword)
    const danglingLineCount =
      danglingComments.length + pendingFillerComments.length;
    const trailingBlanks = Math.max(pendingFillers - danglingLineCount, 0);

    for (let i = 0; i < trailingBlanks; i++) {
      this.factory.pushSegment(this.getIndent());
      this.factory.eol();
    }

    // Emit any filler-carried comments from trailing fillers
    if (pendingFillerComments.length > 0) {
      this.factory.emitCommentLines(pendingFillerComments, this.getIndent());
    }

    // Emit dangling comments at block end
    if (danglingComments.length > 0) {
      this.factory.emitCommentLines(danglingComments, this.getIndent());
    }
  }
}
