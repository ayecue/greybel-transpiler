import { ASTBase, ASTChunk } from 'miniscript-core';

import { BuildMap, DefaultFactoryOptions, Factory } from './build-map/factory';
import { Context } from './context';
import { ResourceHandler } from './resource';
import { DependencyLike } from './types/dependency';
import { TransformerDataObject, TransformerLike } from './types/transformer';
import { Stack } from './utils/stack';

export interface TransformerOptions {
  buildOptions: DefaultFactoryOptions;
  mapFactory: Factory<DefaultFactoryOptions>;
  context: Context;
  environmentVariables: Map<string, string>;
  resourceHandler?: ResourceHandler;
}

export class Transformer implements TransformerLike<DefaultFactoryOptions> {
  // generic
  private _buildOptions: DefaultFactoryOptions;
  private _context: Context;
  private _environmentVariables: Map<string, string>;
  private _buildMap: BuildMap;
  private _resourceHandler: ResourceHandler | null;

  // runtime
  private _currentDependency: DependencyLike | null;
  private _currentStack: Stack;

  get buildOptions() {
    return this._buildOptions;
  }

  get currentStack() {
    return this._currentStack;
  }

  get currentDependency() {
    return this._currentDependency;
  }

  get context() {
    return this._context;
  }

  get environmentVariables() {
    return this._environmentVariables;
  }

  get buildMap() {
    return this._buildMap;
  }

  get resourceHandler() {
    return this._resourceHandler;
  }

  constructor({
    buildOptions,
    mapFactory,
    context,
    environmentVariables,
    resourceHandler
  }: TransformerOptions) {
    const me = this;

    me._buildOptions = buildOptions;
    me._context = context;
    me._environmentVariables = environmentVariables;
    me._buildMap = mapFactory(me);
    me._resourceHandler = resourceHandler ?? null;

    me._currentDependency = null;
    me._currentStack = new Stack();
  }

  make(o: ASTBase, data: TransformerDataObject = {}): string {
    const me = this;
    const currentStack = me._currentStack;
    if (o == null) return '';
    if (o.type == null) {
      console.error('Error AST type:', o);
      throw new Error('Unexpected AST type');
    }
    const fn = me._buildMap[o.type];
    if (fn == null) {
      console.error('Error AST:', o);
      throw new Error('Type does not exist ' + o.type);
    }
    currentStack.push(o);
    const result = fn(o, data);
    currentStack.pop();
    return result;
  }

  transform(chunk: ASTChunk, dependency: DependencyLike = null): string {
    const me = this;

    if (chunk.type !== 'Chunk') {
      throw new Error('Expects chunk');
    }

    me._currentDependency = dependency;

    return me.make(chunk);
  }
}
