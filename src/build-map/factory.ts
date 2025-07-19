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

export interface Line {
  segments: string[];
}

export interface LineRef {
  start: ASTPosition;
  end: ASTPosition;
}

export abstract class Factory<T extends DefaultFactoryOptions> {
  readonly transformer: TransformerLike<T>;

  protected _lines: Line[];
  protected _activeLine: Line;
  protected _originDependency: DependencyLike | null;
  protected _activeDependency: DependencyLike | null;
  protected _currentStack: Stack;

  get activeLine() {
    return this._activeLine;
  }

  get lines() {
    return this._lines;
  }

  get currentStack() {
    return this._currentStack;
  }

  get originDependency() {
    return this._originDependency;
  }

  get activeDependency() {
    return this._activeDependency;
  }

  set activeDependency(dependency: DependencyLike | null) {
    this._activeDependency = dependency;
  }

  abstract handlers: Record<
    string,
    (this: Factory<T>, item: ASTBase, data: TransformerDataObject) => void
  >;

  constructor(transformer: TransformerLike<T>) {
    this.transformer = transformer;
    this._activeLine = this.createLine();
    this._lines = [];
    this._originDependency = null;
    this._activeDependency = null;
    this._currentStack = new Stack();
  }

  pushSegment(segment: string, item?: LineRef) {
    this._activeLine.segments.push(segment);
  }

  pushComment(lineNr: number) {
    throw new Error('Not implemented');
  }

  createLine(): Line {
    return { segments: [] };
  }

  eol(item?: LineRef) {
    this._lines.push(this._activeLine);
    this._activeLine = this.createLine();
  }

  reset() {
    this._activeLine = this.createLine();
    this._lines = [];
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
  abstract generateOptimizations(): string[];
}

export type FactoryConstructor<T extends DefaultFactoryOptions> = new (
  transformer: TransformerLike<T>
) => Factory<T>;
export type FactoryGetter<T extends DefaultFactoryOptions> = (
  type: number
) => FactoryConstructor<T>;
