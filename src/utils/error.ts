import { ASTRange } from 'miniscript-core';

interface BuildContext {
  target: string;
  range?: ASTRange;
}

export class BuildError extends Error {
  target: string;
  range?: ASTRange;

  constructor(message: string, context: BuildContext) {
    super(message);
    this.target = context.target;
    this.range = context.range;
  }
}
