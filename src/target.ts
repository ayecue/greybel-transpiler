import EventEmitter from 'events';
import { ASTChunkAdvanced, Parser } from 'greybel-core';
import { ASTLiteral } from 'miniscript-core';

import { Context } from './context';
import { Dependency } from './dependency';
import { ResourceHandler } from './resource';
import { BuildError } from './utils/error';

export interface TargetOptions {
  target: string;
  resourceHandler: ResourceHandler;
  context: Context;
}

export interface TargetParseOptions {
  disableLiteralsOptimization?: boolean;
  disableNamespacesOptimization?: boolean;
}

export interface TargetParseResultItem {
  chunk: ASTChunkAdvanced;
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

  async parse(options: TargetParseOptions): Promise<TargetParseResult> {
    const me = this;
    const resourceHandler = me.resourceHandler;
    const target = await resourceHandler.resolve(me.target);

    if (!(await resourceHandler.has(target))) {
      throw new Error('Target ' + target + ' does not exist...');
    }

    const context = me.context;
    const content = await resourceHandler.get(target);

    me.emit('parse-before', target);

    try {
      const parser = new Parser(content, {
        filename: target
      });
      const chunk = parser.parseChunk() as ASTChunkAdvanced;
      const dependency = new Dependency({
        target,
        resourceHandler,
        chunk,
        context
      });

      const { namespaces, literals } = await dependency.findDependencies();

      if (!options.disableNamespacesOptimization) {
        const uniqueNamespaces = new Set(namespaces);

        for (const namespace of uniqueNamespaces) {
          context.variables.createNamespace(namespace);
        }
      }

      if (!options.disableLiteralsOptimization) {
        for (const literal of literals) {
          context.literals.add(literal as ASTLiteral);
        }
      }

      return {
        main: {
          chunk,
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
