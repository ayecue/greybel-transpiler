interface BuildContext {
  target: string;
}

export class BuildError extends Error {
  relatedTarget: string;

  constructor(message: string, context: BuildContext) {
    super(message);
    this.relatedTarget = context.target;
  }
}
