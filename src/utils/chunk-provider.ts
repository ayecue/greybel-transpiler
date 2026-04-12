import { ASTChunkGreybel, Parser } from 'greybel-core';

import { ChunkProviderLike } from '../types/chunk-provider';

export class ChunkProvider implements ChunkProviderLike {
  private cache: Map<string, ASTChunkGreybel>;
  environmentVariables: Map<string, string>;
  strictMode: boolean;

  constructor(
    environmentVariables?: Map<string, string>,
    strictMode?: boolean
  ) {
    this.cache = new Map<string, ASTChunkGreybel>();
    this.environmentVariables = environmentVariables ?? new Map();
    this.strictMode = strictMode ?? false;
  }

  parse(target: string, content: string): ASTChunkGreybel {
    const cachedChunk = this.cache.get(target);

    if (cachedChunk) {
      return cachedChunk;
    }

    const parser = new Parser(content, {
      filename: target,
      preserve: true,
      environmentVariables: this.environmentVariables,
      strictMode: this.strictMode
    });
    const chunk = parser.parseChunk() as ASTChunkGreybel;
    this.cache.set(target, chunk);
    return chunk;
  }
}
