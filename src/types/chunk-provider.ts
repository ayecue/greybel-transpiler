import { ASTChunk } from 'miniscript-core';

export interface ChunkProviderLike {
  parse(target: string, content: string): ASTChunk;
}
