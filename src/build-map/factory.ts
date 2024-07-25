import { ASTBase } from 'miniscript-core';

import { TransformerDataObject, TransformerLike } from '../types/transformer';

export interface DefaultFactoryOptions {
  isDevMode: boolean;
}

export interface BuildMap {
  [type: string]: (item: ASTBase, _data: TransformerDataObject) => string;
}

export type FactoryMake = (
  item: ASTBase,
  data?: TransformerDataObject
) => string;

export interface Factory<T extends DefaultFactoryOptions> {
  (transformer: TransformerLike<T>): BuildMap;
}
