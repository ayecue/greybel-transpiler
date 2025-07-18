import { ASTChunkGreybel, Parser } from 'greybel-core';

import { ChunkProviderLike } from '../types/chunk-provider';

export class ChunkProvider implements ChunkProviderLike {
  private cache: Map<string, ASTChunkGreybel>;

  constructor() {
    this.cache = new Map<string, ASTChunkGreybel>();
  }

  async parse(target: string, content: string): Promise<ASTChunkGreybel> {
    const cachedChunk = this.cache.get(target);

    if (cachedChunk) {
      return cachedChunk;
    }

    const parser = new Parser(content, {
      filename: target
    });
    const chunk = parser.parseChunk() as ASTChunkGreybel;
    this.cache.set(target, chunk);
    return chunk;
  }
}
