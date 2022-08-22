
import defaultFactory, { BuildMap } from './default';
import uglifyFactory from './uglify';
import beatuifyFactory from './beautify';
import { ASTBase } from 'greybel-core';
import { TransformerDataObject } from '../transformer';
import Context from '../context';

export enum BuildType {
    DEFAULT,
    UGLIFY,
    BEAUTIFY
}

export { BuildMap } from  './default';

const FACTORIES = {
    [BuildType.DEFAULT]: defaultFactory,
    [BuildType.UGLIFY]: uglifyFactory,
    [BuildType.BEAUTIFY]: beatuifyFactory
};

export default function getFactory(type: BuildType = BuildType.DEFAULT): (
    make: (item: ASTBase, _data: TransformerDataObject) => string,
    context: Context,
    environmentVariables: Map<string, string>
) => BuildMap {
    const factory = FACTORIES[type];

    if (!factory) {
        throw new Error('Unknown build type.');
    }

    return factory;
}