import { beautifyFactory } from './beautify';
import { defaultFactory } from './default';
import { DefaultFactoryOptions, Factory } from './factory';
import { uglifyFactory } from './uglify';

export enum BuildType {
  DEFAULT,
  UGLIFY,
  BEAUTIFY
}

const FACTORIES: Record<BuildType, Factory<DefaultFactoryOptions>> = {
  [BuildType.DEFAULT]: defaultFactory,
  [BuildType.UGLIFY]: uglifyFactory,
  [BuildType.BEAUTIFY]: beautifyFactory
};

export function getFactory(
  type: BuildType = BuildType.DEFAULT
): Factory<DefaultFactoryOptions> {
  const factory = FACTORIES[type];

  if (!factory) {
    throw new Error('Unknown build type.');
  }

  return factory;
}
