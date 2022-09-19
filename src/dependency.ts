import md5 from 'blueimp-md5';
import EventEmitter from 'events';
import {
  ASTChunkAdvanced,
  ASTFeatureIncludeExpression,
  Parser
} from 'greybel-core';
import { ASTBaseBlockWithScope } from 'greyscript-core';
import fetchNamespaces from './utils/fetch-namespaces';

import Context from './context';
import { ResourceHandler } from './resource';

export interface DependencyOptions {
  target: string;
  resourceHandler: ResourceHandler;
  chunk: ASTChunkAdvanced;
  isInclude?: boolean;
  context: Context;
}

export default class Dependency extends EventEmitter {
  target: string;
  id: string;
  resourceHandler: ResourceHandler;
  chunk: ASTChunkAdvanced;
  /* eslint-disable no-use-before-define */
  dependencies: Dependency[];
  isInclude: boolean;
  context: Context;

  constructor(options: DependencyOptions) {
    super();

    const me = this;

    me.target = options.target;
    me.id = md5(options.target);
    me.resourceHandler = options.resourceHandler;
    me.chunk = options.chunk;
    me.dependencies = [];
    me.isInclude = options.isInclude || false;
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

  async fetchNativeImports() {
    const me = this;
    const nativeImports = [];

    for (const nativeImport of me.chunk.nativeImports) {
      const importPath = await me.resourceHandler.getTargetRelativeTo(me.target, nativeImport);
      nativeImports.push(importPath);
    }

    const defers = [];

    for (const dependency of me.dependencies) {
      defers.push(dependency.fetchNativeImports());
    }

    const dependencyImports: Array<Array<string>> = await Promise.all(defers);

    for (const dependencyImport of dependencyImports) {
      nativeImports.push(...dependencyImport);
    }

    return nativeImports;
  }

  async findDependencies(namespaces: string[]): Promise<Dependency[]> {
    const me = this;
    const globalDependencyMap: Map<string, Dependency> = me.context.data.get(
      'globalDependencyMap'
    );
    const resourceHandler = me.resourceHandler;
    const context = me.context;
    const items = [...me.chunk.imports, ...me.chunk.includes];
    const result = [];
    let item;

    for (item of items) {
      const subTarget = await resourceHandler.getTargetRelativeTo(
        me.target,
        item.path
      );
      const id = md5(subTarget);
      const namespace = context.modules.get(id);

      if (globalDependencyMap.has(namespace)) {
        const dependency = globalDependencyMap.get(namespace);
        item.chunk = dependency.chunk;
        item.namespace = namespace;
        result.push(dependency);
        continue;
      }

      if (!(await resourceHandler.has(subTarget))) {
        throw new Error('Dependency ' + subTarget + ' does not exist...');
      }

      const isInclude =
        (item as ASTFeatureIncludeExpression).type ===
        'FeatureIncludeExpression';
      const content = await resourceHandler.get(subTarget);

      me.emit('parse-before', subTarget);

      const parser = new Parser(content);
      const chunk = parser.parseChunk() as ASTChunkAdvanced;

      namespaces.push(...fetchNamespaces(chunk));
      item.chunk = chunk;

      const dependency = new Dependency({
        target: subTarget,
        resourceHandler,
        chunk,
        isInclude,
        context
      });
      await dependency.findDependencies(namespaces);

      item.namespace = context.modules.get(id);

      me.emit('parse-after', dependency);

      result.push(dependency);
    }

    me.dependencies = result;

    return result;
  }
}
