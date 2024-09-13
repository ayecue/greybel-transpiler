import { ASTBase, ASTChunk, ASTPosition } from 'miniscript-core';

import { DependencyLike } from '../types/dependency';
import type {
  TransformerDataObject,
  TransformerLike
} from '../types/transformer';
import { Stack } from '../utils/stack';

export interface DefaultFactoryOptions {
  isDevMode?: boolean;
}

export type FactoryMake = (
  item: ASTBase,
  data?: TransformerDataObject
) => string[];

export enum TokenType {
  Text,
  EndOfLine,
  Comment
}

export interface BasicToken {
  type: TokenType;
  value: string;
  ref: {
    start: ASTPosition;
    end: ASTPosition;
  };
}

export interface CommentToken extends BasicToken {
  type: TokenType.Comment;
  isMultiline: boolean;
}

export type Token = BasicToken | CommentToken;

export abstract class Factory<T extends DefaultFactoryOptions> {
  readonly transformer: TransformerLike<T>;

  protected _tokens: Token[];
  protected _currentDependency: DependencyLike | null;
  protected _currentStack: Stack;

  get tokens() {
    return this._tokens;
  }

  get currentStack() {
    return this._currentStack;
  }

  get currentDependency() {
    return this._currentDependency;
  }

  abstract handlers: Record<
    string,
    (this: Factory<T>, item: ASTBase, data: TransformerDataObject) => void
  >;

  constructor(transformer: TransformerLike<T>) {
    this.transformer = transformer;
    this._tokens = [];
    this._currentDependency = null;
    this._currentStack = new Stack();
  }

  process(item: ASTBase, data: TransformerDataObject = {}): void {
    const me = this;
    const currentStack = me._currentStack;
    if (item == null) return;
    if (item.type == null) {
      console.error('Error AST type:', item);
      throw new Error('Unexpected AST type');
    }
    const fn = me.handlers[item.type];
    if (fn == null) {
      console.error('Error AST:', item);
      throw new Error('Type does not exist ' + item.type);
    }
    currentStack.push(item);
    fn.call(this, item, data);
    currentStack.pop();
  }

  abstract transform(item: ASTChunk, dependency: DependencyLike): string;
}

export type FactoryConstructor<T extends DefaultFactoryOptions> = new (
  transformer: TransformerLike<T>
) => Factory<T>;
export type FactoryGetter<T extends DefaultFactoryOptions> = (
  type: number
) => FactoryConstructor<T>;
