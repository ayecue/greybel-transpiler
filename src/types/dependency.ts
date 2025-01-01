import { ASTChunkGreybel } from 'greybel-core';
import { ASTBase } from 'miniscript-core';

import { Context } from '../context';
import { ResourceHandler } from '../resource';

export enum DependencyType {
  Main = 0,
  Import = 1,
  Include = 2
}

export interface DependencyLike {
  target: string;
  id: string;
  resourceHandler: ResourceHandler;
  chunk: ASTChunkGreybel;
  /* eslint-disable no-use-before-define */
  dependencies: Set<DependencyLike>;
  context: Context;
  injections: Map<string, string>;

  type: DependencyType | number;
  ref?: ASTBase;
}
