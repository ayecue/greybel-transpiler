import { ASTChunkGreybel } from 'greybel-core';

import { ResourceManagerLike } from './resource-manager';

export enum DependencyType {
  Main = 0,
  Import = 1,
  Include = 2
}

export interface DependencyLike {
  target: string;
  id: string;
  type: DependencyType | number;
  resourceManager: ResourceManagerLike;
  injections: Map<string, string>;
  dependencies: Map<string, DependencyLike>;
  chunk: ASTChunkGreybel;

  getId(): string;
  getNamespace(): string;
}
