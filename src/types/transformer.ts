import { ASTChunkAdvanced } from 'greybel-core';

import type { DefaultFactoryOptions, Factory } from '../build-map/factory';
import { Context } from '../context';
import { ResourceHandler } from '../resource';
import { DependencyLike } from './dependency';

export interface TransformerDataObject {
  [key: string]: any;
}

export interface TransformerLike<T extends DefaultFactoryOptions> {
  buildOptions: T;
  context: Context;
  environmentVariables: Map<string, string>;
  resourceHandler: ResourceHandler | null;
  factory: Factory<T> | null;

  transform(chunk: ASTChunkAdvanced, dependency: DependencyLike): string;
}
