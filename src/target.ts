import EventEmitter from 'events';
import { ASTChunk, ASTChunkAdvanced, ASTLiteral, Parser } from 'greybel-core';

import Context from './context';
import Dependency, { DependencyRef, DependencyType } from './dependency';
import { ResourceHandler } from './resource';

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
  chunk: ASTChunk;
  dependency: Dependency;
}

export interface TargetParseResult {
  main: TargetParseResultItem;
  nativeImports: Map<string, TargetParseResultItem>;
}

export default class Target extends EventEmitter {
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
    const astDepMap = me.context.getOrCreateData<
      Map<DependencyRef, Set<Dependency>>
    >('astDepMap', () => new Map());

    for (const item of dependency.dependencies) {
      if (item.type === DependencyType.NativeImport) {
        const subImports = item.fetchNativeImports();

        for (const subImport of subImports) {
          parsedImports.set(subImport.target, {
            chunk: subImport.chunk,
            dependency: subImport
          });
        }

        parsedImports.set(item.target, {
          chunk: item.chunk,
          dependency: item
        });

        astDepMap.set(item.ref, subImports);
      }
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
  }
}
