import { ASTRange } from 'greyscript-core';

interface BuildContext {
  target: string;
  range?: ASTRange;
}

export class BuildError extends Error {
  relatedTarget: string;
  range: ASTRange;

  constructor(message: string, context: BuildContext) {
    super(message);
    this.relatedTarget = context.target;
    this.range = context.range;
  }
}
