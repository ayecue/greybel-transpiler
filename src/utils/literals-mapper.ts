import md5 from 'blueimp-md5';
import { ASTLiteral } from 'miniscript-core';

import { NamespaceGenerator } from './namespace-generator';

export interface LiteralMetaData {
  literal: ASTLiteral;
  amount: number;
  length: number;
  namespace: string;
}

export class LiteralsMapper {
  mapping: Map<string, LiteralMetaData>;
  variableNamespacesGenerator: NamespaceGenerator;

  constructor(variableNamespacesGenerator: NamespaceGenerator) {
    const me = this;
    me.mapping = new Map();
    me.variableNamespacesGenerator = variableNamespacesGenerator;
  }

  reset(): LiteralsMapper {
    const me = this;
    me.mapping = new Map();
    return me;
  }

  add(literal: ASTLiteral): LiteralsMapper {
    const me = this;
    const raw = literal.raw.toString();
    if (!me.mapping.has(raw)) {
      me.mapping.set(raw, {
        literal,
        amount: 1,
        length: raw.length,
        namespace: null
      });
    } else {
      const item = me.mapping.get(raw);
      const amount = item.amount + 1;
      const length = item.length + raw.length;

      item.amount = amount;
      item.length = length;

      if (length > 10 && amount > 2 && item.namespace == null) {
        item.namespace = me.variableNamespacesGenerator.createNamespace(
          md5(raw)
        );
      }
    }
    return me;
  }

  get(literal: ASTLiteral): LiteralMetaData {
    const me = this;
    const raw = literal.raw.toString();
    if (me.mapping.has(raw)) {
      return me.mapping.get(raw);
    }
    return null;
  }

  getMapping(): Map<string, LiteralMetaData> {
    return this.mapping;
  }
}
