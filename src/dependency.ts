import md5 from 'blueimp-md5';
import EventEmitter from 'events';
import {
  ASTChunkAdvanced,
  ASTFeatureImportExpression,
  ASTFeatureIncludeExpression,
  Parser
} from 'greybel-core';
import { ASTBase, ASTImportCodeExpression } from 'greyscript-core';

import Context from './context';
import { ResourceHandler } from './resource';
import fetchNamespaces from './utils/fetch-namespaces';

export enum DependencyType {
  Main,
  Import,
  Include,
  NativeImport
}

export type DependencyRef =
  | ASTImportCodeExpression
  | ASTFeatureIncludeExpression
  | ASTFeatureImportExpression;

export interface DependencyOptions {
  target: string;
  resourceHandler: ResourceHandler;
  chunk: ASTChunkAdvanced;
  context: Context;

  type?: DependencyType;
  ref?: DependencyRef;
}

export interface DependencyFindResult {
  /* eslint-disable no-use-before-define */
  dependencies: Set<Dependency>;
  namespaces: string[];
  literals: ASTBase[];
}

export default class Dependency extends EventEmitter {
  target: string;
  id: string;
  resourceHandler: ResourceHandler;
  chunk: ASTChunkAdvanced;
  /* eslint-disable no-use-before-define */
  dependencies: Set<Dependency>;
  context: Context;

  type: DependencyType;
  ref?: DependencyRef;

  constructor(options: DependencyOptions) {
    super();

    const me = this;

    me.target = options.target;
    me.id = md5(options.target);
    me.resourceHandler = options.resourceHandler;
    me.chunk = options.chunk;
    me.dependencies = new Set<Dependency>();
    me.type = options.type || DependencyType.Main;
    me.context = options.context;
    me.ref = options.ref;

    const namespace = me.context.createModuleNamespace(me.id);
    const resourceDepMap = me.context.getOrCreateData<Map<string, Dependency>>(
      'resourceDepMap',
      () => new Map()
    );

    resourceDepMap.set(namespace, me);
  }

  getId(): string {
    return this.id;
  }

  getNamespace(): string {
    const me = this;
    return me.context.modules.get(me.id);
  }

  fetchNativeImports(): Set<Dependency> {
    const me = this;
    const result = [];

    for (const item of me.dependencies) {
      if (item.type === DependencyType.NativeImport) {
        result.push(item, ...item.fetchNativeImports());
      }
    }

    return new Set<Dependency>(result);
  }

  private async resolve(
    path: string,
    type: DependencyType,
    ref?: DependencyRef
  ): Promise<Dependency> {
    const me = this;
    const context = me.context;
    const { data, modules } = context;
    const resourceDepMap: Map<string, Dependency> = data.get('resourceDepMap');
    const resourceHandler = me.resourceHandler;
    const subTarget = await resourceHandler.getTargetRelativeTo(
      me.target,
      path
    );
    const id = md5(subTarget);
    const namespace = modules.get(id);

    if (resourceDepMap.has(namespace)) {
      return resourceDepMap.get(namespace);
    }

    if (!(await resourceHandler.has(subTarget))) {
      throw new Error('Dependency ' + subTarget + ' does not exist...');
    }

    const content = await resourceHandler.get(subTarget);

    me.emit('parse-before', subTarget);

    const parser = new Parser(content);
    const chunk = parser.parseChunk() as ASTChunkAdvanced;
    const dependency = new Dependency({
      target: subTarget,
      resourceHandler,
      chunk,
      type,
      context,
      ref
    });

    me.emit('parse-after', dependency);

    return dependency;
  }

  async findDependencies(): Promise<DependencyFindResult> {
    const me = this;
    const { imports, includes, nativeImports } = me.chunk;
    const namespaces: string[] = [...fetchNamespaces(me.chunk)];
    const literals: ASTBase[] = [...me.chunk.literals];
    const result: Dependency[] = [];

    // handle native imports
    for (const nativeImport of nativeImports) {
      if (!nativeImport.fileSystemDirectory) {
        continue;
      }

      const dependency = await me.resolve(
        nativeImport.fileSystemDirectory,
        DependencyType.NativeImport,
        nativeImport
      );
      const r = await dependency.findDependencies();

      namespaces.push(...r.namespaces);
      literals.push(...r.literals);

      result.push(dependency);
    }

    // handle internal includes/imports
    const items = [...imports, ...includes];

    for (const item of items) {
      const type =
        item instanceof ASTFeatureIncludeExpression
          ? DependencyType.Include
          : DependencyType.Import;
      const dependency = await me.resolve(item.path, type, item);
      const chunk = dependency.chunk;

      item.chunk = chunk;
      item.namespace = dependency.getNamespace();

      const r = await dependency.findDependencies();

      result.push(...dependency.fetchNativeImports());

      namespaces.push(...r.namespaces);
      literals.push(...r.literals);

      result.push(dependency);
    }

    const dependencies = new Set<Dependency>(result);

    me.dependencies = dependencies;

    return {
      dependencies,
      namespaces,
      literals
    };
  }
}
