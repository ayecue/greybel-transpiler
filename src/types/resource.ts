import { ASTChunkGreybel } from 'greybel-core';

export enum ResourceLoadState {
  Pending = 1,
  Ready = 2
}

export interface Resource {
  target: string;
  chunk: ASTChunkGreybel;
}
