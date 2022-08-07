import { ASTBase, ASTChunk } from 'greybel-core';

import { BuildMap } from './build-map/default';
import Context from './context';
import Stack from './utils/stack';

export interface TransformerDataObject {
  [key: string]: any;
}

export default class Transformer {
  currentStack: Stack;
  context: Context;
  buildMap: BuildMap;

  constructor(
    mapFactory: (
      make: Function,
      context: Context,
      environmentVariables: Map<string, string>
    ) => BuildMap,
    context: Context,
    environmentVariables: Map<string, string>
  ) {
    const me = this;

    me.currentStack = new Stack();
    me.context = context;
    me.buildMap = mapFactory(me.make.bind(me), context, environmentVariables);
  }

  make(o: ASTBase, data: TransformerDataObject = {}): string {
    const me = this;
    const currentStack = me.currentStack;
    if (o == null) return '';
    if (o.type == null) {
      console.error('Error ast type:', o);
      throw new Error('Unexpected as type');
    }
    const fn = me.buildMap[o.type];
    if (fn == null) {
      console.error('Error ast:', o);
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
