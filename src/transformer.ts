import { ASTChunk } from 'miniscript-core';

import {
  DefaultFactoryOptions,
  Factory,
  FactoryConstructor
} from './build-map/factory';
import { Context } from './context';
import { DependencyLike } from './types/dependency';
import { TransformerLike } from './types/transformer';
import { ResourceHandler } from './utils/resource-provider';

export interface TransformerOptions {
  buildOptions: DefaultFactoryOptions;
  factoryConstructor: FactoryConstructor<DefaultFactoryOptions>;
  context: Context;
  environmentVariables: Map<string, string>;
  resourceHandler?: ResourceHandler;
}

export class Transformer implements TransformerLike<DefaultFactoryOptions> {
  // generic
  private _buildOptions: DefaultFactoryOptions;
  private _context: Context;
  private _environmentVariables: Map<string, string>;
  private _factory: Factory<DefaultFactoryOptions>;
  private _resourceHandler: ResourceHandler | null;

  get factory() {
    return this._factory;
  }

  get buildOptions() {
    return this._buildOptions;
  }

  get context() {
    return this._context;
  }

  get environmentVariables() {
    return this._environmentVariables;
  }

  get resourceHandler() {
    return this._resourceHandler;
  }

  constructor({
    buildOptions,
    factoryConstructor,
    context,
    environmentVariables,
    resourceHandler
  }: TransformerOptions) {
    const me = this;

    me._buildOptions = buildOptions;
    me._context = context;
    me._environmentVariables = environmentVariables;
    me._factory = new factoryConstructor(me);
    me._resourceHandler = resourceHandler ?? null;
  }

  transform(chunk: ASTChunk, dependency: DependencyLike = null): string {
    const me = this;

    if (chunk.type !== 'Chunk') {
      throw new Error('Expects chunk');
    }

    return me._factory.transform(chunk, dependency);
  }
}
