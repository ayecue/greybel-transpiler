import { ASTBase } from 'miniscript-core';

import { BuildMap } from '../build-map/factory';
import { Context } from '../context';
import { ResourceHandler } from '../resource';
import { Stack } from '../utils/stack';
import { DependencyLike } from './dependency';

export interface TransformerDataObject {
  [key: string]: any;
}

export interface TransformerLike<T> {
  buildOptions: T;
  currentDependency: DependencyLike | null;
  currentStack: Stack;
  context: Context;
  environmentVariables: Map<string, string>;
  buildMap: BuildMap;
  resourceHandler: ResourceHandler | null;

  make(o: ASTBase, data?: TransformerDataObject): string;
}
