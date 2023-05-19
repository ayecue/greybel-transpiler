import EventEmitter from 'events';
import { ASTChunkAdvanced, Parser } from 'greybel-core';
import { ASTLiteral } from 'greyscript-core';

import { Context } from './context';
import { Dependency, DependencyRef, DependencyType } from './dependency';
import { ResourceHandler } from './resource';
import { BuildError } from './utils/error';

export interface TargetOptions {
  target: string;
  resourceHandler: ResourceHandler;
  context: Context;
}

export interface TargetParseOptions {
  disableLiteralsOptimization?: boolean;
  disableNamespacesOptimization?: boolean;
}

export interface TargetParseResultItem {
  chunk: ASTChunkAdvanced;
  dependency: Dependency;
}

export interface TargetParseResult {
  main: TargetParseResultItem;
  nativeImports: Map<string, TargetParseResultItem>;
}

export class Target extends EventEmitter {
  target: string;
  resourceHandler: ResourceHandler;
  context: Context;

  constructor(options: TargetOptions) {
    super();

    const me = this;

    me.target = options.target;
    me.resourceHandler = options.resourceHandler;
    me.context = options.context;
  }

  async parse(options: TargetParseOptions): Promise<TargetParseResult> {
    const me = this;
    const resourceHandler = me.resourceHandler;
    const target = await resourceHandler.resolve(me.target);

    if (!(await resourceHandler.has(target))) {
      throw new Error('Target ' + target + ' does not exist...');
    }

    const context = me.context;
    const content = await resourceHandler.get(target);

    me.emit('parse-before', target);

    try {
      const parser = new Parser(content);
      const chunk = parser.parseChunk() as ASTChunkAdvanced;
      const dependency = new Dependency({
        target,
        resourceHandler,
        chunk,
        context
      });

      const { namespaces, literals } = await dependency.findDependencies();

      const parsedImports: Map<string, TargetParseResultItem> = new Map();
      const astRefDependencyMap = me.context.getOrCreateData<
        Map<
          DependencyRef,
          {
            main: Dependency;
            imports: Set<Dependency>;
          }
        >
      >('astRefDependencyMap', () => new Map());

      for (const item of dependency.dependencies) {
        const relatedImports = item.fetchNativeImports();

        for (const subImport of relatedImports) {
          parsedImports.set(subImport.target, {
            chunk: subImport.chunk,
            dependency: subImport
          });
        }

        if (item.type === DependencyType.NativeImport) {
          parsedImports.set(item.target, {
            chunk: item.chunk,
            dependency: item
          });
        }

        astRefDependencyMap.set(item.ref, {
          main: item,
          imports: relatedImports
        });
      }

      if (!options.disableNamespacesOptimization) {
        const uniqueNamespaces = new Set(namespaces);

        for (const namespace of uniqueNamespaces) {
          context.variables.createNamespace(namespace);
        }
      }

      if (!options.disableLiteralsOptimization) {
        for (const literal of literals) {
          context.literals.add(literal as ASTLiteral);
        }
      }

      return {
        main: {
          chunk,
          dependency
        },
        nativeImports: parsedImports
      };
    } catch (err: any) {
      if (err instanceof BuildError) {
        throw err;
      }

      throw new BuildError(err.message, {
        target: this.target
      });
    }
  }
}
