import md5 from 'blueimp-md5';
import EventEmitter from 'events';
import {
  ASTChunkAdvanced,
  ASTFeatureIncludeExpression,
  Parser
} from 'greybel-core';
import { ASTBase, ASTBaseBlockWithScope } from 'greyscript-core';
import fetchNamespaces from './utils/fetch-namespaces';

import Context from './context';
import { ResourceHandler } from './resource';

export enum DependencyType {
  Main,
  Import,
  Include,
  NativeImport
};

export interface DependencyOptions {
  target: string;
  resourceHandler: ResourceHandler;
  chunk: ASTChunkAdvanced;
  type?: DependencyType;
  context: Context;
}

export interface DependencyFindResult {
  /* eslint-disable no-use-before-define */
  dependencies: Dependency[];
  namespaces: string[];
  literals: ASTBase[];
}

export default class Dependency extends EventEmitter {
  target: string;
  id: string;
  resourceHandler: ResourceHandler;
  chunk: ASTChunkAdvanced;
  /* eslint-disable no-use-before-define */
  dependencies: Dependency[];
  type: DependencyType;
  context: Context;

  constructor(options: DependencyOptions) {
    super();

    const me = this;

    me.target = options.target;
    me.id = md5(options.target);
    me.resourceHandler = options.resourceHandler;
    me.chunk = options.chunk;
    me.dependencies = [];
    me.type = options.type || DependencyType.Main;
    me.context = options.context;

    if (!me.context.data.has('globalDependencyMap')) {
      me.context.data.set('globalDependencyMap', new Map<string, Dependency>());
    }

    const namespace = me.context.modules.createNamespace(me.id);
    const globalDependencyMap: Map<string, Dependency> = me.context.data.get(
      'globalDependencyMap'
    );

    globalDependencyMap.set(namespace, me);
  }

  getId(): string {
    return this.id;
  }

  getNamespace(): string {
    const me = this;
    return me.context.modules.get(me.id);
  }

  private async resolve(path: string, type: DependencyType): Promise<Dependency> {
    const me = this;
    const globalDependencyMap: Map<string, Dependency> = me.context.data.get(
      'globalDependencyMap'
    );
    const context = me.context;
    const resourceHandler = me.resourceHandler;
    const subTarget = await resourceHandler.getTargetRelativeTo(
      me.target,
      path
    );
    const id = md5(subTarget);
    const namespace = context.modules.get(id);

    if (globalDependencyMap.has(namespace)) {
      return globalDependencyMap.get(namespace);
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
      context
    });

    me.emit('parse-after', dependency);

    return dependency;
  }

  async findDependencies(): Promise<DependencyFindResult> {
    const me = this;
    const { imports, includes, nativeImports } = me.chunk;
    const namespaces: string[] = [...fetchNamespaces(me.chunk)];
    const literals: ASTBase[] = [...me.chunk.literals];
    const result = [];

    //handle native imports
    for (const nativeImport of nativeImports) {
      const dependency = await me.resolve(nativeImport, DependencyType.NativeImport);
      const r = await dependency.findDependencies();

      namespaces.push(...r.namespaces);
      literals.push(...r.literals);

      result.push(dependency);
    }

    //handle internal includes/imports
    const items = [...imports, ...includes];

    for (const item of items) {
      const type = item instanceof ASTFeatureIncludeExpression ? DependencyType.Include : DependencyType.Import;
      const dependency = await me.resolve(item.path, type);
      const chunk = dependency.chunk;

      item.chunk = chunk;
      item.namespace = dependency.getNamespace();

      const r = await dependency.findDependencies();

      namespaces.push(...r.namespaces);
      literals.push(...r.literals);

      result.push(dependency);
    }

    me.dependencies = result;

    return {
      dependencies: result,
      namespaces,
      literals
    };
  }
}
