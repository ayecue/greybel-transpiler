import { ParserValidator } from 'greyscript-core';

import { LiteralsMapper } from './utils/literals-mapper';
import { NamespaceGenerator } from './utils/namespace-generator';

export interface ContextOptions {
  variablesCharset?: string;
  variablesExcluded?: string[];
  modulesCharset?: string;
}

export enum ContextDataProperty {
  ASTRefDependencyMap = 'astRefDependencyMap',
  ProcessImportPathCallback = 'processImportPathCallback',
  ResourceDependencyMap = 'resourceDependencyMap',
  DependencyCallStack = 'dependencyCallStack',
  ASTRefsVisited = 'astRefsVisited'
}

export class Context {
  modules: NamespaceGenerator;
  variables: NamespaceGenerator;
  literals: LiteralsMapper;
  data: Map<ContextDataProperty, any>;

  constructor(options: ContextOptions) {
    const me = this;

    me.modules = new NamespaceGenerator({
      characters: options.modulesCharset
    });

    me.variables = new NamespaceGenerator({
      characters: options.variablesCharset,
      defaultNamespaces: [
        'BACKSLASH_CODE',
        'NEW_LINE_OPERATOR',
        'MODULES',
        'EXPORTED',
        '__REQUIRE',
        'MAIN',
        'module',
        'globals'
      ],
      forbidden: [
        ...new ParserValidator()
          .getNatives()
          .filter((item: string) => item !== 'globals'),
        ...(options.variablesExcluded || [])
      ]
    });

    me.literals = new LiteralsMapper(me.variables);
    me.data = new Map();
  }

  createModuleNamespace(id: string) {
    return this.modules.createNamespace(id);
  }

  getOrCreateData<T>(key: ContextDataProperty, onCreate: () => T): T {
    const me = this;

    if (me.data.has(key)) {
      return me.data.get(key);
    }

    const v = onCreate();
    me.data.set(key, v);
    return v;
  }

  set<T>(key: ContextDataProperty, value: T): Context {
    this.data.set(key, value);
    return this;
  }

  get<T>(key: ContextDataProperty): T {
    return this.data.get(key);
  }
}
