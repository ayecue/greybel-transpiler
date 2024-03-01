import md5 from 'blueimp-md5';
import EventEmitter from 'events';
import {
  ASTChunkAdvanced,
  ASTFeatureIncludeExpression,
  Parser
} from 'greybel-core';
import { ASTBase } from 'miniscript-core';

import { Context, ContextDataProperty } from './context';
import { ResourceHandler } from './resource';
import { BuildError } from './utils/error';
import { fetchNamespaces } from './utils/fetch-namespaces';

export enum DependencyType {
  Main = 0,
  Import = 1,
  Include = 2
}

export interface DependencyOptions {
  target: string;
  resourceHandler: ResourceHandler;
  chunk: ASTChunkAdvanced;
  context: Context;

  type?: DependencyType | number;
  ref?: ASTBase;
}

export interface DependencyFindResult {
  /* eslint-disable no-use-before-define */
  dependencies: Set<Dependency>;
  namespaces: string[];
  literals: ASTBase[];
}

/* eslint-disable no-use-before-define */
export type ResourceDependencyMap = Map<string, Dependency>;

export type DependencyCallStack = string[];

export class Dependency extends EventEmitter {
  target: string;
  id: string;
  resourceHandler: ResourceHandler;
  chunk: ASTChunkAdvanced;
  /* eslint-disable no-use-before-define */
  dependencies: Set<Dependency>;
  context: Context;

  type: DependencyType | number;
  ref?: ASTBase;

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
    const resourceDependencyMap =
      me.context.getOrCreateData<ResourceDependencyMap>(
        ContextDataProperty.ResourceDependencyMap,
        () => new Map()
      );

    resourceDependencyMap.set(namespace, me);

    me.context.getOrCreateData<DependencyCallStack>(
      ContextDataProperty.DependencyCallStack,
      () => []
    );
  }

  getId(): string {
    return this.id;
  }

  getNamespace(): string {
    const me = this;
    return me.context.modules.get(me.id);
  }

  private async resolve(
    path: string,
    type: DependencyType,
    ref?: ASTBase
  ): Promise<Dependency> {
    const me = this;
    const context = me.context;
    const { modules } = context;
    const resourceDependencyMap = context.get<ResourceDependencyMap>(
      ContextDataProperty.ResourceDependencyMap
    );
    const resourceHandler = me.resourceHandler;
    const subTarget = await resourceHandler.getTargetRelativeTo(
      me.target,
      path
    );
    const id = md5(subTarget);
    const namespace = modules.get(id);

    if (resourceDependencyMap.has(namespace)) {
      return resourceDependencyMap.get(namespace);
    }

    if (!(await resourceHandler.has(subTarget))) {
      throw new Error('Dependency ' + subTarget + ' does not exist...');
    }

    const content = await resourceHandler.get(subTarget);

    me.emit('parse-before', subTarget);

    try {
      const parser = new Parser(content, {
        filename: subTarget
      });
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
    } catch (err: any) {
      if (err instanceof BuildError) {
        throw err;
      }

      throw new BuildError(err.message, {
        target: subTarget,
        range: err.range
      });
    }
  }

  async findDependencies(): Promise<DependencyFindResult> {
    const me = this;
    const { imports, includes } = me.chunk;
    const sourceNamespace = me.getNamespace();
    const dependencyCallStack = me.context.get<DependencyCallStack>(
      ContextDataProperty.DependencyCallStack
    );
    const namespaces: string[] = [...fetchNamespaces(me.chunk)];
    const literals: ASTBase[] = [...me.chunk.literals];
    const result: Dependency[] = [];

    dependencyCallStack.push(sourceNamespace);

    // handle internal includes/imports
    const items = [...imports, ...includes];

    for (const item of items) {
      const type =
        item instanceof ASTFeatureIncludeExpression
          ? DependencyType.Include
          : DependencyType.Import;
      const dependency = await me.resolve(item.path, type, item);
      const namespace = dependency.getNamespace();

      if (dependencyCallStack.includes(namespace)) {
        throw new Error(
          `Circular dependency from ${me.target} to ${dependency.target} detected.`
        );
      }

      const chunk = dependency.chunk;

      item.chunk = chunk;
      item.namespace = namespace;

      const relatedDependencies = await dependency.findDependencies();

      namespaces.push(...relatedDependencies.namespaces);
      literals.push(...relatedDependencies.literals);
      result.push(dependency);
    }

    const dependencies = new Set<Dependency>(result);

    me.dependencies = dependencies;

    dependencyCallStack.pop();

    return {
      dependencies,
      namespaces,
      literals
    };
  }
}
