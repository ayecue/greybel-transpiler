import { HEADER_BOILERPLATE, MAIN_BOILERPLATE } from '../boilerplates';
import { Context } from '../context';
import { Transformer } from '../transformer';

export class OutputProcessor {
  private processed: string[];
  private context: Context;
  private transformer: Transformer;
  private headerBoilerplate: string;
  private mainBoilerplate: string;

  constructor(context: Context, transformer: Transformer) {
    this.context = context;
    this.transformer = transformer;
    this.processed = [];
    this.headerBoilerplate = this.transformer.transform(HEADER_BOILERPLATE);
    this.mainBoilerplate = this.transformer.transform(MAIN_BOILERPLATE);
  }

  addLiteralsOptimization() {
    const context = this.context;
    const literalMapping = Array.from(
      context.literals.getMapping().values()
    ).filter((literal) => literal.namespace != null);
    const tempVarForGlobal = context.variables.get('globals');

    if (literalMapping.length > 0) {
      this.processed.push(
        'globals.' + tempVarForGlobal + '=globals',
        ...literalMapping.map((literal) => {
          return `${tempVarForGlobal}.${literal.namespace}=${literal.literal.raw}`;
        })
      );
    }

    return this;
  }

  addHeader() {
    this.processed.push(this.headerBoilerplate);
    return this;
  }

  addCode(code: string, isMainModule: boolean = false) {
    if (isMainModule) {
      const moduleCode = this.mainBoilerplate.replace('"$0"', code);
      this.processed.push(moduleCode);
    } else {
      this.processed.push(code);
    }

    return this;
  }

  build(): string {
    return this.processed.join('\n');
  }
}
