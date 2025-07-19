import md5 from 'blueimp-md5';
import EventEmitter from 'events';
import { ASTChunkGreybel, ASTFeatureIncludeExpression } from 'greybel-core';
import { ASTBase } from 'miniscript-core';

import { Context, ContextDataProperty } from './context';
import { DependencyLike, DependencyType } from './types/dependency';
import { ResourceManagerLike } from './types/resource-manager';
import { BuildError } from './utils/error';
import { fetchNamespaces } from './utils/fetch-namespaces';
import { merge } from './utils/merge';

export interface DependencyOptions {
  target: string;
  resourceManager: ResourceManagerLike;
  chunk: ASTChunkGreybel;
  context: Context;
  type?: DependencyType | number;
}

export interface DependencyFindResult {
  /* eslint-disable no-use-before-define */
  dependencies: Map<string, Dependency>;
  namespaces: string[];
  literals: ASTBase[];
}

/* eslint-disable no-use-before-define */
export type ResourceDependencyMap = Map<string, Dependency>;

export type DependencyCallStack = string[];

export class Dependency implements DependencyLike {
  target: string;
  id: string;
  resourceManager: ResourceManagerLike;
  chunk: ASTChunkGreybel;
  /* eslint-disable no-use-before-define */
  dependencies: Map<string, Dependency>;
  context: Context;
  injections: Map<string, string>;

  type: DependencyType | number;

  static generateDependencyMappingKey(
    relativePath: string,
    type: DependencyType
  ): string {
    return `${type}:${relativePath}`;
  }

  constructor(options: DependencyOptions) {
    const me = this;

    me.target = options.target;
    me.id = md5(options.target);
    me.chunk = options.chunk;
    me.resourceManager = options.resourceManager;
    me.dependencies = new Map();
    me.injections = new Map();
    me.type = options.type || DependencyType.Main;
    me.context = options.context;

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

  protected resolve(path: string, type: DependencyType): Dependency {
    const me = this;
    const context = me.context;
    const { modules } = context;
    const resourceDependencyMap = context.get<ResourceDependencyMap>(
      ContextDataProperty.ResourceDependencyMap
    );
    const resourceManager = me.resourceManager;
    const subTarget = resourceManager.getRelativePathMapping(me.target, path);
    const id = md5(subTarget);
    const namespace = modules.get(id);

    if (resourceDependencyMap.has(namespace)) {
      return resourceDependencyMap.get(namespace);
    }

    try {
      const chunk = this.resourceManager.getResource(subTarget)
        .chunk as ASTChunkGreybel;
      const dependency = new Dependency({
        target: subTarget,
        resourceManager,
        chunk,
        type,
        context
      });

      return dependency;
    } catch (err: any) {
      throw new BuildError(err.message, {
        target: subTarget,
        range: err.range
      });
    }
  }

  findInjections(): Map<string, string> {
    const me = this;
    const { injects } = me.chunk;
    const injections: Map<string, string> = new Map();

    for (const item of injects) {
      const injectionTarget = me.resourceManager.getRelativePathMapping(
        me.target,
        item.path
      );
      const content = me.resourceManager.getInjection(injectionTarget);

      injections.set(item.path, content);
    }

    me.injections = injections;

    return injections;
  }

  findDependencies(): DependencyFindResult {
    const me = this;
    const { imports, includes } = me.chunk;
    const sourceNamespace = me.getNamespace();
    const dependencyCallStack = me.context.get<DependencyCallStack>(
      ContextDataProperty.DependencyCallStack
    );
    const namespaces: string[] = [...fetchNamespaces(me.chunk)];
    const literals: ASTBase[] = [...me.chunk.literals];
    const dependencies = new Map<string, Dependency>();

    dependencyCallStack.push(sourceNamespace);

    // handle internal includes/imports
    const items = [...imports, ...includes];

    for (const item of items) {
      const type =
        item instanceof ASTFeatureIncludeExpression
          ? DependencyType.Include
          : DependencyType.Import;
      const dependency = me.resolve(item.path, type);
      const namespace = dependency.getNamespace();

      if (dependencyCallStack.includes(namespace)) {
        throw new Error(
          `Circular dependency from ${me.target} to ${dependency.target} detected.`
        );
      }
      
      const relatedDependencies = dependency.findDependencies();

      merge(namespaces, relatedDependencies.namespaces);
      merge(literals, relatedDependencies.literals);
      dependencies.set(
        Dependency.generateDependencyMappingKey(item.path, type),
        dependency
      );
    }

    this.findInjections();

    me.dependencies = dependencies;

    dependencyCallStack.pop();

    return {
      dependencies,
      namespaces,
      literals
    };
  }
}
