import { ASTBase } from 'miniscript-core';

import { Context } from '../context';
import { TransformerDataObject } from '../transformer';

export interface DefaultFactoryOptions {
  isDevMode: boolean;
}

export interface BuildMap {
  [type: string]: (item: ASTBase, _data: TransformerDataObject) => string;
}

export interface Factory<T extends DefaultFactoryOptions> {
  (
    options: T,
    make: (item: ASTBase, data?: TransformerDataObject) => string,
    context: Context,
    environmentVariables: Map<string, string>
  ): BuildMap;
}
