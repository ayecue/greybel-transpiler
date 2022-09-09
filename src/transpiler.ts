import {
  HEADER_BOILERPLATE,
  MAIN_BOILERPLATE,
  MODULE_BOILERPLATE
} from './boilerplates';
import getFactory, { BuildType } from './build-map';
import Context from './context';
import Dependency from './dependency';
import { ResourceHandler, ResourceProvider } from './resource';
import Target, { TargetParseResult, TargetParseResultItem } from './target';
import Transformer from './transformer';
import generateCharsetMap from './utils/charset-generator';

export interface TranspilerOptions {
  target: string;
  context?: Context;

  obfuscation?: boolean;
  buildType?: BuildType;
  installer?: boolean;
  excludedNamespaces?: string[];
  disableLiteralsOptimization?: boolean;
  disableNamespacesOptimization?: boolean;
  environmentVariables?: Map<string, string>;

  resourceHandler?: ResourceHandler;
}

export interface TranspilerParseResult {
  [key: string]: string;
}

export default class Transpiler {
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

    const charsetMap = generateCharsetMap(options.obfuscation);

    me.context = new Context({
      variablesCharset: charsetMap.variables,
      variablesExcluded: options.excludedNamespaces,
      modulesCharset: charsetMap.modules
    });

    me.obfuscation = options.obfuscation || true;
    me.buildType = options.buildType || BuildType.DEFAULT;
    me.installer = options.installer || false;
    me.disableLiteralsOptimization =
      options.disableLiteralsOptimization ||  me.buildType !== BuildType.UGLIFY;
    me.disableNamespacesOptimization =
      options.disableNamespacesOptimization ||  me.buildType !== BuildType.UGLIFY;
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
    const tempVarForGlobal = context.variables.createNamespace('globals');
    const transformer = new Transformer(
      mapFactory,
      context,
      me.environmentVariables
    );
    const mainModule = targetParseResult.main;
    const headerBoilerplate = transformer.transform(HEADER_BOILERPLATE);
    const moduleBoilerplate = transformer.transform(MODULE_BOILERPLATE);
    const mainBoilerplate = transformer.transform(MAIN_BOILERPLATE);
    const build = (
      mainDependency: Dependency,
      optimizeLiterals: boolean,
      isNativeImport: boolean
    ): string => {
      const mainNamespace = context.modules.get(mainDependency.getId());
      const modules: { [key: string]: string } = {};
      let moduleCount = 0;
      const iterator = function (item: Dependency) {
        const moduleName = context.modules.get(item.getId());

        if (moduleName in modules) return;
        if (moduleName !== mainNamespace && !item.isInclude) {
          const code = transformer.transform(item.chunk);
          modules[moduleName] = moduleBoilerplate
            .replace('"$0"', '"' + moduleName + '"')
            .replace('"$1"', code);
          moduleCount++;
        }

        item.dependencies.forEach(iterator);
      };

      iterator(mainDependency);

      const processed = [];

      if (!isNativeImport) {
        if (optimizeLiterals) {
          const literalMapping = context.literals.getMapping();

          if (literalMapping.size > 0) {
            processed.push('globals.' + tempVarForGlobal + '=globals');

            literalMapping.forEach(function (literal) {
              if (literal.namespace == null) return;
              processed.push(
                tempVarForGlobal +
                  '.' +
                  literal.namespace +
                  '=' +
                  literal.literal.raw
              );
            });
          }
        }

        if (moduleCount > 0) {
          processed.push(headerBoilerplate);
        }
      }

      Object.keys(modules).forEach((moduleKey: string) =>
        processed.push(modules[moduleKey])
      );

      const code = transformer.transform(mainDependency.chunk);

      if (isNativeImport) {
        processed.push(code);
      } else {
        const moduleCode = mainBoilerplate.replace('"$0"', code);
        processed.push(moduleCode);
      }

      return processed.join('\n');
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
