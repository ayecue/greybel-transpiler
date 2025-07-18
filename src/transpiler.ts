import { MODULE_BOILERPLATE } from './boilerplates';
import { BuildType, getFactory } from './build-map';
import { BeautifyOptions } from './build-map/beautify';
import { DefaultFactoryOptions } from './build-map/factory';
import { UglifyOptions } from './build-map/uglify';
import { Context } from './context';
import { Dependency } from './dependency';
import { Target, TargetParseResult } from './target';
import { Transformer } from './transformer';
import { DependencyType } from './types/dependency';
import { generateCharsetMap } from './utils/charset-generator';
import { OutputProcessor } from './utils/output-processor';
import { ResourceHandler, ResourceProvider } from './utils/resource-provider';

const hasOwnProperty = Object.prototype.hasOwnProperty;

export interface TranspilerOptions {
  target: string;
  context?: Context;
  resourceHandler?: ResourceHandler;

  obfuscation?: boolean;
  buildType?: BuildType;
  buildOptions?: BeautifyOptions & UglifyOptions & DefaultFactoryOptions;
  installer?: boolean;
  excludedNamespaces?: string[];
  environmentVariables?: Map<string, string>;
}

export interface TranspilerParseResult {
  [key: string]: string;
}

export class Transpiler {
  target: string;
  context: Context;
  resourceHandler: ResourceHandler;

  obfuscation: boolean;
  buildType: BuildType;
  buildOptions: BeautifyOptions & UglifyOptions & DefaultFactoryOptions;
  installer: boolean;
  environmentVariables: Map<string, string>;

  constructor(options: TranspilerOptions) {
    const me = this;

    me.target = options.target;
    me.resourceHandler =
      options.resourceHandler || new ResourceProvider().getHandler();
    me.obfuscation = hasOwnProperty.call(options, 'obfuscation')
      ? options.obfuscation
      : true;

    const charsetMap = generateCharsetMap(me.obfuscation);

    me.context = new Context({
      variablesCharset: charsetMap.variables,
      variablesExcluded: options.excludedNamespaces,
      modulesCharset: charsetMap.modules
    });

    me.buildType = options.buildType || BuildType.DEFAULT;
    me.buildOptions = options.buildOptions || { isDevMode: false };
    me.installer = options.installer || false;
    me.environmentVariables = options.environmentVariables || new Map();
  }

  async parse(): Promise<TranspilerParseResult> {
    const me = this;
    const factoryConstructor = getFactory(me.buildType);
    const context = me.context;
    const target = new Target({
      target: me.target,
      resourceHandler: me.resourceHandler,
      context: me.context
    });
    const targetParseResult: TargetParseResult = await target.parse();

    // create builder
    const transformer = new Transformer({
      buildOptions: me.buildOptions,
      factoryConstructor,
      context,
      environmentVariables: me.environmentVariables,
      resourceHandler: me.resourceHandler
    });
    const mainModule = targetParseResult.main;
    const moduleBoilerplate = transformer.transform(MODULE_BOILERPLATE);
    const build = (mainDependency: Dependency): string => {
      const mainNamespace = context.modules.get(mainDependency.getId());
      const modules: { [key: string]: string } = {};
      let moduleCount = 0;
      const iterator = function (item: Dependency) {
        const moduleName = item.getNamespace();

        if (moduleName in modules) return;
        if (
          moduleName !== mainNamespace &&
          item.type === DependencyType.Import
        ) {
          const code = transformer.transform(item.chunk, item);
          modules[moduleName] = moduleBoilerplate
            .replace('"$0"', () => '"' + moduleName + '"')
            .replace('"$1"', () => code);
          moduleCount++;
        }

        for (const subItem of item.dependencies.values()) {
          iterator(subItem);
        }
      };

      iterator(mainDependency);

      const output = new OutputProcessor(context, transformer);

      output.addOptimizations();
      if (moduleCount > 0) output.addHeader();

      Object.keys(modules).forEach((moduleKey: string) =>
        output.addCode(modules[moduleKey])
      );

      const code = transformer.transform(mainDependency.chunk, mainDependency);

      output.addCode(code, true);

      return output.build();
    };

    return {
      [me.target]: build(mainModule.dependency)
    };
  }
}
