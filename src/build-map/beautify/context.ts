import {
  ASTAssignmentStatement,
  ASTBase,
  ASTBaseBlock,
  ASTType
} from 'miniscript-core';

import { DefaultFactoryOptions, Factory } from '../factory';
import { commentToText } from './utils';

export enum IndentationType {
  Tab,
  Whitespace
}

export interface BeautifyContextOptions extends DefaultFactoryOptions {
  keepParentheses: boolean;
  indentation: IndentationType;
  indentationSpaces: number;
  isDevMode: boolean;
  strictMode: boolean;
}

export class BeautifyContext {
  readonly options: BeautifyContextOptions;

  private factory: Factory<Partial<BeautifyContextOptions>>;
  private _indent: number;
  private _isMultilineAllowed: boolean;

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
    this._isMultilineAllowed = true;
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

  emitLeadingComments(node: ASTBase): void {
    const comments = node.leadingComments;
    if (!comments || comments.length === 0) return;

    const indent = this.getIndent();
    const isDevMode = this.options.isDevMode;
    for (const value of comments) {
      this.factory.pushSegment(indent + commentToText(value, isDevMode));
      this.factory.eol();
    }
  }

  emitTrailingComments(node: ASTBase): void {
    const comments = node.trailingComments;
    if (!comments || comments.length === 0) return;

    const isDevMode = this.options.isDevMode;
    for (const value of comments) {
      const text = commentToText(value, isDevMode);
      if (text.length > 0) {
        this.factory.appendTrailingComment(text);
      }
    }
  }

  emitEndTrailingComments(node: ASTBase): void {
    const comments = node.endTrailingComments;
    if (!comments || comments.length === 0) return;

    const isDevMode = this.options.isDevMode;
    for (const value of comments) {
      const text = commentToText(value, isDevMode);
      if (text.length > 0) {
        this.factory.appendTrailingComment(text);
      }
    }
  }

  emitTrailingCommentsToLine(node: ASTBase, lineIndex: number): void {
    const comments = node.trailingComments;
    if (!comments || comments.length === 0) return;

    const isDevMode = this.options.isDevMode;
    for (const value of comments) {
      const text = commentToText(value, isDevMode);
      if (text.length > 0) {
        this.factory.appendTrailingCommentToLine(lineIndex, text);
      }
    }
  }

  private isBlockStatement(node: ASTBase): boolean {
    switch (node.type) {
      case ASTType.ForGenericStatement:
      case ASTType.WhileStatement:
      case ASTType.IfStatement:
      case ASTType.IfShortcutStatement:
        return true;
      case ASTType.AssignmentStatement:
        return (
          (node as ASTAssignmentStatement).init?.type ===
          ASTType.FunctionDeclaration
        );
      default:
        return false;
    }
  }

  buildBlock(block: ASTBaseBlock): void {
    for (const current of block.body) {
      if (current.type === ASTType.NoopStatement) {
        // NoopStatement = blank line. Emit its leading comments if any.
        if (current.leadingComments && current.leadingComments.length > 0) {
          this.emitLeadingComments(current);
        } else {
          // Plain blank line
          this.factory.pushSegment(this.getIndent());
          this.factory.eol();
        }
        continue;
      }

      // Emit leading comments for this body item
      this.emitLeadingComments(current);

      // Process the body item itself
      this.factory.pushSegment(this.getIndent());

      const lineCountBefore = this.factory.lines.length;
      this.factory.process(current, { isCommand: true });
      const lineCountAfter = this.factory.lines.length;

      // For multi-line block statements (for/while/if/function/shortcut-if),
      // trailing comments belong on the opener line, not the closer line.
      if (lineCountAfter > lineCountBefore && this.isBlockStatement(current)) {
        this.emitTrailingCommentsToLine(current, lineCountBefore);
        this.emitEndTrailingComments(current);
      } else {
        this.emitTrailingComments(current);
      }

      this.factory.eol();
    }
  }
}
