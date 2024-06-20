import { ASTBase, ASTChunk } from 'miniscript-core';

import { BuildMap, Factory } from './build-map/factory';
import { Context } from './context';
import { Stack } from './utils/stack';

export interface TransformerDataObject {
  [key: string]: any;
}

export class Transformer {
  static DEFAULT_TARGET: string = 'unknown';

  currentTarget: string;
  currentStack: Stack;
  context: Context;
  buildMap: BuildMap;

  constructor(
    options: object,
    mapFactory: Factory<object>,
    context: Context,
    environmentVariables: Map<string, string>
  ) {
    const me = this;

    me.currentTarget = Transformer.DEFAULT_TARGET;
    me.currentStack = new Stack();
    me.context = context;
    me.buildMap = mapFactory(
      options,
      me.make.bind(me),
      context,
      environmentVariables
    );
  }

  make(o: ASTBase, data: TransformerDataObject = {}): string {
    const me = this;
    const currentStack = me.currentStack;
    if (o == null) return '';
    if (o.type == null) {
      console.error('Error AST type:', o);
      throw new Error('Unexpected AST type');
    }
    const fn = me.buildMap[o.type];
    if (fn == null) {
      console.error('Error AST:', o);
      throw new Error('Type does not exist ' + o.type);
    }
    currentStack.push(o);
    const result = fn(o, data);
    currentStack.pop();
    return result;
  }

  transform(chunk: ASTChunk): string {
    const me = this;

    if (chunk.type !== 'Chunk') {
      throw new Error('Expects chunk');
    }

    return me.make(chunk);
  }
}
