import EventEmitter from 'events';
import { ASTChunkGreybel } from 'greybel-core';
import { ASTLiteral } from 'miniscript-core';

import { Context } from './context';
import { Dependency } from './dependency';
import { ChunkProvider } from './utils/chunk-provider';
import { BuildError } from './utils/error';
import { ResourceManager } from './utils/resource-manager';
import { ResourceHandler } from './utils/resource-provider';

export interface TargetOptions {
  target: string;
  resourceHandler: ResourceHandler;
  context: Context;
}

export interface TargetParseResultItem {
  chunk: ASTChunkGreybel;
  dependency: Dependency;
}

export interface TargetParseResult {
  main: TargetParseResultItem;
}

export class Target extends EventEmitter {
  target: string;
  resourceHandler: ResourceHandler;
  context: Context;

  constructor(options: TargetOptions) {
    super();

    const me = this;

    me.target = options.target;
    me.resourceHandler = options.resourceHandler;
    me.context = options.context;
  }

  async parse(eager: boolean): Promise<TargetParseResult> {
    const me = this;
    const resourceHandler = me.resourceHandler;
    const target = await resourceHandler.resolve(me.target);

    if (!(await resourceHandler.has(target))) {
      throw new Error('Target ' + target + ' does not exist...');
    }

    const context = me.context;
    const chunkProvider = new ChunkProvider();
    const resourceManager = new ResourceManager({
      resourceHandler,
      chunkProvider
    });

    try {
      await resourceManager.load(target);

      const dependency = new Dependency({
        target,
        resourceManager,
        chunk: resourceManager.getEntryPointResource().chunk,
        context
      });

      if (eager) {
        const { namespaces, literals } = dependency.findEagerDependencies();
        const uniqueNamespaces = new Set(namespaces);

        for (const namespace of uniqueNamespaces) {
          context.variables.createNamespace(namespace);
        }

        for (const literal of literals) {
          context.literals.add(literal as ASTLiteral);
        }
      } else {
        dependency.findDependencies();
      }

      return {
        main: {
          chunk: resourceManager.getEntryPointResource().chunk,
          dependency
        }
      };
    } catch (err: any) {
      if (err instanceof BuildError) {
        throw err;
      }

      throw new BuildError(err.message, {
        target: this.target,
        range: err.range
      });
    }
  }
}
