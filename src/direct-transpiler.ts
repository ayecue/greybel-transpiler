import EventEmitter from 'events';
import { ASTChunkGreybel, Parser } from 'greybel-core';
import { ASTLiteral } from 'miniscript-core';

import { BuildType, getFactory } from './build-map';
import { BeautifyOptions } from './build-map/beautify';
import { DefaultFactoryOptions } from './build-map/factory';
import { UglifyOptions } from './build-map/uglify';
import { Context } from './context';
import { Transformer } from './transformer';
import { generateCharsetMap } from './utils/charset-generator';
import { fetchNamespaces } from './utils/fetch-namespaces';
import { OutputProcessor } from './utils/output-processor';
import { ChunkProvider } from './utils/chunk-provider';

const hasOwnProperty = Object.prototype.hasOwnProperty;

export interface DirectTranspilerOptions {
  code: string;

  obfuscation?: boolean;
  buildType?: BuildType;
  buildOptions?: UglifyOptions & BeautifyOptions & DefaultFactoryOptions;
  environmentVariables?: Map<string, string>;

  excludedNamespaces?: string[];
}

export class DirectTranspiler extends EventEmitter {
  code: string;

  obfuscation: boolean;
  buildType: BuildType;
  buildOptions: UglifyOptions & BeautifyOptions & DefaultFactoryOptions;
  installer: boolean;
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
    me.buildOptions = options.buildOptions || { isDevMode: false };
    me.environmentVariables = options.environmentVariables || new Map();

    me.excludedNamespaces = options.excludedNamespaces || [];
  }

  parse(): string {
    const me = this;

    const factoryConstructor = getFactory(me.buildType);
    const chunkProvider = new ChunkProvider();
    const chunk = chunkProvider.parse('unknown', me.code) as ASTChunkGreybel;
    const namespaces = fetchNamespaces(chunk);
    const literals = [].concat(chunk.literals);
    const charsetMap = generateCharsetMap(me.obfuscation);
    const context = new Context({
      variablesCharset: charsetMap.variables,
      variablesExcluded: me.excludedNamespaces,
      modulesCharset: charsetMap.modules
    });
    const uniqueNamespaces = new Set(namespaces);
    uniqueNamespaces.forEach((namespace: string) =>
      context.variables.createNamespace(namespace)
    );

    literals.forEach((literal: ASTLiteral) => context.literals.add(literal));

    const transformer = new Transformer({
      buildOptions: me.buildOptions,
      factoryConstructor,
      context,
      environmentVariables: me.environmentVariables
    });
    const output = new OutputProcessor(context, transformer);

    output.addOptimizations();

    const result = transformer.transform(chunk);

    output.addCode(result);

    return output.build();
  }
}
