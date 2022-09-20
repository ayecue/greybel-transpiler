import EventEmitter from 'events';
import { ASTChunkAdvanced, ASTLiteral, Parser } from 'greybel-core';

import getFactory, { BuildType } from './build-map';
import Context from './context';
import Transformer from './transformer';
import generateCharsetMap from './utils/charset-generator';
import fetchNamespaces from './utils/fetch-namespaces';

const hasOwnProperty = Object.prototype.hasOwnProperty;

export interface DirectTranspilerOptions {
  code: string;

  obfuscation?: boolean;
  buildType?: BuildType;
  disableLiteralsOptimization?: boolean;
  disableNamespacesOptimization?: boolean;
  environmentVariables?: Map<string, string>;

  excludedNamespaces?: string[];
}

export default class DirectTranspiler extends EventEmitter {
  code: string;

  obfuscation: boolean;
  buildType: BuildType;
  installer: boolean;
  disableLiteralsOptimization: boolean;
  disableNamespacesOptimization: boolean;
  environmentVariables: Map<string, string>;

  excludedNamespaces: string[];

  constructor(options: DirectTranspilerOptions) {
    super();

    const me = this;

    me.code = options.code;

    me.obfuscation = hasOwnProperty.call(options, 'obfuscation')
      ? options.obfuscation
      : true;
    me.buildType = options.buildType || BuildType.DEFAULT;
    me.disableLiteralsOptimization =
      options.disableLiteralsOptimization || me.buildType !== BuildType.UGLIFY;
    me.disableNamespacesOptimization =
      options.disableNamespacesOptimization ||
      me.buildType !== BuildType.UGLIFY;
    me.environmentVariables = options.environmentVariables || new Map();

    me.excludedNamespaces = options.excludedNamespaces || [];
  }

  parse(): string {
    const me = this;

    const mapFactory = getFactory(me.buildType);
    const parser = new Parser(me.code);
    const chunk = parser.parseChunk() as ASTChunkAdvanced;
    const namespaces = fetchNamespaces(chunk);
    const literals = [].concat(chunk.literals);
    const charsetMap = generateCharsetMap(me.obfuscation);
    const context = new Context({
      variablesCharset: charsetMap.variables,
      variablesExcluded: me.excludedNamespaces,
      modulesCharset: charsetMap.modules
    });

    if (!me.disableNamespacesOptimization) {
      const uniqueNamespaces = new Set(namespaces);
      uniqueNamespaces.forEach((namespace: string) =>
        context.variables.createNamespace(namespace)
      );
    }

    if (!me.disableLiteralsOptimization) {
      literals.forEach((literal: ASTLiteral) => context.literals.add(literal));
    }

    const tempVarForGlobal = context.variables.createNamespace('globals');
    const transformer = new Transformer(
      mapFactory,
      context,
      me.environmentVariables
    );
    const processed = [];

    if (!me.disableLiteralsOptimization) {
      const literalMapping = Array.from(
        context.literals.getMapping().values()
      ).filter((literal) => literal.namespace != null);

      if (literalMapping.length > 0) {
        processed.push(
          'globals.' + tempVarForGlobal + '=globals',
          ...literalMapping.map((literal) => {
            return `${tempVarForGlobal}.${literal.namespace}=${literal.literal.raw}`;
          })
        );
      }
    }

    const result = transformer.transform(chunk);

    processed.push(result);

    return processed.join('\n');
  }
}
