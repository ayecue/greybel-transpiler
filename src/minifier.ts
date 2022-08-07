import EventEmitter from 'events';
import { ASTBase, ASTChunkAdvanced, ASTLiteral, Parser } from 'greybel-core';

import defaultFactory, { BuildMap } from './build-map/default';
import uglifyFactory from './build-map/uglify';
import Context from './context';
import Transformer, { TransformerDataObject } from './transformer';
import generateCharsetMap from './utils/charset-generator';

export interface MinifierOptions {
  code: string;

  obfuscation?: boolean;
  uglify?: boolean;
  disableLiteralsOptimization?: boolean;
  disableNamespacesOptimization?: boolean;
  environmentVariables?: Map<string, string>;

  excludedNamespaces?: string[];
}

export default class Minifier extends EventEmitter {
  code: string;

  obfuscation: boolean;
  uglify: boolean;
  installer: boolean;
  disableLiteralsOptimization: boolean;
  disableNamespacesOptimization: boolean;
  environmentVariables: Map<string, string>;

  excludedNamespaces: string[];

  constructor(options: MinifierOptions) {
    super();

    const me = this;

    me.code = options.code;

    me.obfuscation = options.obfuscation || true;
    me.uglify = options.uglify || false;
    me.disableLiteralsOptimization =
      options.disableLiteralsOptimization || false;
    me.disableNamespacesOptimization =
      options.disableNamespacesOptimization || false;
    me.environmentVariables = options.environmentVariables || new Map();

    me.excludedNamespaces = options.excludedNamespaces || [];
  }

  getBuildMapFactory(): (
    make: (item: ASTBase, _data: TransformerDataObject) => string,
    context: Context,
    environmentVariables: Map<string, string>
  ) => BuildMap {
    const me = this;
    return me.uglify ? uglifyFactory : defaultFactory;
  }

  minify(): string {
    const me = this;

    const mapFactory = me.getBuildMapFactory();
    const parser = new Parser(me.code);
    const chunk = parser.parseChunk() as ASTChunkAdvanced;
    const namespaces = [].concat(Array.from(chunk.namespaces));
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
      const literalMapping = context.literals.getMapping();

      processed.push('globals.' + tempVarForGlobal + '=globals');

      literalMapping.forEach(function (literal) {
        if (literal.namespace == null) return;
        processed.push(
          tempVarForGlobal + '.' + literal.namespace + '=' + literal.literal.raw
        );
      });
    }

    const result = transformer.transform(chunk);

    processed.push(result);

    return processed.join('\n');
  }
}
