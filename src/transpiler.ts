import { MODULE_BOILERPLATE } from './boilerplates';
import { BuildType, getFactory } from './build-map';
import { Context, ContextDataProperty } from './context';
import { Dependency, DependencyType } from './dependency';
import { ResourceHandler, ResourceProvider } from './resource';
import { Target, TargetParseResult, TargetParseResultItem } from './target';
import { Transformer } from './transformer';
import { generateCharsetMap } from './utils/charset-generator';
import { ProcessImportPathCallback } from './utils/inject-imports';
import { OutputProcessor } from './utils/output-processor';

const hasOwnProperty = Object.prototype.hasOwnProperty;

export interface TranspilerOptions {
  target: string;
  context?: Context;
  resourceHandler?: ResourceHandler;

  obfuscation?: boolean;
  buildType?: BuildType;
  installer?: boolean;
  excludedNamespaces?: string[];
  disableLiteralsOptimization?: boolean;
  disableNamespacesOptimization?: boolean;
  environmentVariables?: Map<string, string>;

  processImportPathCallback?: ProcessImportPathCallback;
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
  installer: boolean;
  disableLiteralsOptimization: boolean;
  disableNamespacesOptimization: boolean;
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

    if (options.processImportPathCallback) {
      me.context.set(
        ContextDataProperty.ProcessImportPathCallback,
        options.processImportPathCallback
      );
    }

    me.buildType = options.buildType || BuildType.DEFAULT;
    me.installer = options.installer || false;
    me.disableLiteralsOptimization =
      options.disableLiteralsOptimization || me.buildType !== BuildType.UGLIFY;
    me.disableNamespacesOptimization =
      options.disableNamespacesOptimization ||
      me.buildType !== BuildType.UGLIFY;
    me.environmentVariables = options.environmentVariables || new Map();
  }

  async parse(): Promise<TranspilerParseResult> {
    const me = this;
    const mapFactory = getFactory(me.buildType);
    const context = me.context;
    const target = new Target({
      target: me.target,
      resourceHandler: me.resourceHandler,
      context: me.context
    });
    const targetParseResult: TargetParseResult = await target.parse({
      disableLiteralsOptimization: me.disableLiteralsOptimization,
      disableNamespacesOptimization: me.disableNamespacesOptimization
    });

    // create builder
    const transformer = new Transformer(
      mapFactory,
      context,
      me.environmentVariables
    );
    const mainModule = targetParseResult.main;
    const moduleBoilerplate = transformer.transform(MODULE_BOILERPLATE);
    const build = (
      mainDependency: Dependency,
      optimizeLiterals: boolean,
      isNativeImport: boolean
    ): string => {
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
          const code = transformer.transform(item.chunk);
          modules[moduleName] = moduleBoilerplate
            .replace('"$0"', '"' + moduleName + '"')
            .replace('"$1"', code);
          moduleCount++;
        }

        for (const subItem of item.dependencies) {
          if (item.type !== DependencyType.NativeImport) {
            iterator(subItem);
          }
        }
      };

      iterator(mainDependency);

      const output = new OutputProcessor(context, transformer);

      if (!isNativeImport) {
        if (optimizeLiterals) output.addLiteralsOptimization();
        if (moduleCount > 0) output.addHeader();
      }

      Object.keys(modules).forEach((moduleKey: string) =>
        output.addCode(modules[moduleKey])
      );

      const code = transformer.transform(mainDependency.chunk);

      output.addCode(code, !isNativeImport);

      return output.build();
    };

    return {
      [me.target]: build(
        mainModule.dependency,
        !me.disableLiteralsOptimization,
        false
      ),
      ...Array.from(targetParseResult.nativeImports.values()).reduce(
        (result: TranspilerParseResult, value: TargetParseResultItem) => {
          return {
            ...result,
            [value.dependency.target]: build(
              value.dependency,
              !me.disableLiteralsOptimization,
              true
            )
          };
        },
        {}
      )
    };
  }
}
