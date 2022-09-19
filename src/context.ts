import { ParserValidator } from 'greybel-core';

import LiteralsMapper from './utils/literals-mapper';
import NamespaceGenerator from './utils/namespace-generator';

export interface ContextOptions {
  variablesCharset?: string;
  variablesExcluded?: string[];
  modulesCharset?: string;
}

export default class Context {
  modules: NamespaceGenerator;
  variables: NamespaceGenerator;
  literals: LiteralsMapper;
  data: Map<string, any>;

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

  getOrCreateData<T>(key: string, onCreate: () => T): T {
    const me = this;

    if (me.data.has(key)) {
      return me.data.get(key);
    }

    const v = onCreate();
    me.data.set(key, v);
    return v;
  }
}
