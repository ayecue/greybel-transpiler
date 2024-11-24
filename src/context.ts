import { Keyword } from 'miniscript-core';
import { LiteralsMapper } from './utils/literals-mapper';
import { NamespaceGenerator } from './utils/namespace-generator';

export interface ContextOptions {
  variablesCharset?: string;
  variablesExcluded?: string[];
  modulesCharset?: string;
}

export enum ContextDataProperty {
  ResourceDependencyMap = 'resourceDependencyMap',
  DependencyCallStack = 'dependencyCallStack'
}

export class Context {
  modules: NamespaceGenerator;
  variables: NamespaceGenerator;
  literals: LiteralsMapper;
  data: Map<ContextDataProperty | string, any>;

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
        'locals',
        'outer',
        'self',
        'super',
        'string',
        'list',
        'map',
        'number',
        'funcRef',
        ...Object.values(Keyword),
        ...(options.variablesExcluded || [])
      ]
    });

    me.literals = new LiteralsMapper(me.variables);
    me.data = new Map();
  }

  createModuleNamespace(id: string) {
    return this.modules.createNamespace(id);
  }

  getOrCreateData<T>(key: ContextDataProperty | string, onCreate: () => T): T {
    const me = this;

    if (me.data.has(key)) {
      return me.data.get(key);
    }

    const v = onCreate();
    me.data.set(key, v);
    return v;
  }

  set<T>(key: ContextDataProperty | string, value: T): Context {
    this.data.set(key, value);
    return this;
  }

  get<T>(key: ContextDataProperty | string): T {
    return this.data.get(key);
  }
}
