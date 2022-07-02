import Context from './context';
import {
	Parser,
	ASTChunk,
	ASTLiteral,
	ASTChunkAdvanced
} from 'greybel-core';
import { ResourceHandler } from './resource';
import Dependency from './dependency';
import EventEmitter from 'events';

export interface TargetOptions {
	target: string;
	resourceHandler: ResourceHandler;
	context: Context;
	environmentVariables?: Map<string, string>
}

export interface TargetParseOptions {
	disableLiteralsOptimization?: boolean;
	disableNamespacesOptimization?: boolean;
}

export interface TargetParseResultItem {
	chunk: ASTChunk;
	dependency: Dependency;
}

export interface TargetParseResult {
	main: TargetParseResultItem;
	nativeImports: Map<string, TargetParseResultItem>;
}

export default class Target extends EventEmitter {
	target: string;
	resourceHandler: ResourceHandler;
	context: Context;
	environmentVariables: Map<string, string>;

	constructor(options: TargetOptions) {
		super();

		const me = this;

		me.target = options.target;
		me.resourceHandler = options.resourceHandler;
		me.context = options.context;
		me.environmentVariables = options.environmentVariables || new Map();
	}

	async parse(options: TargetParseOptions): Promise<TargetParseResult> {
		const me = this;
		const resourceHandler = me.resourceHandler;
		const environmentVariables = me.environmentVariables;
		const target = await resourceHandler.resolve(me.target);

		if (!await resourceHandler.has(target)) {
			throw new Error('Target ' + target + ' does not exist...');
		}

		const context = me.context;
		const content = await resourceHandler.get(target);

		me.emit('parse-before', target);

		const parser = new Parser(content, {
			environmentVariables
		});
		const chunk = parser.parseChunk() as ASTChunkAdvanced;
		const namespaces = [].concat(Array.from(chunk.namespaces));
		const literals = [].concat(chunk.literals);
		const nativeImports: Map<string, TargetParseResultItem> = new Map();

		for (const nativeImport of chunk.nativeImports) {
			const subTarget = await resourceHandler.getTargetRelativeTo(target, nativeImport);
			const subContent = await resourceHandler.get(subTarget);
			const subParser = new Parser(subContent, {
				environmentVariables
			});
			const subChunk = subParser.parseChunk() as ASTChunkAdvanced;
			const subDependency = new Dependency({
				target: subTarget,
				resourceHandler,
				chunk: subChunk,
				context,
				environmentVariables
			});
			await subDependency.findDependencies(namespaces);

			namespaces.push(...Array.from(subChunk.namespaces));
			literals.push(...subChunk.literals);

			nativeImports.set(nativeImport, {
				chunk: subChunk,
				dependency: subDependency
			});
		}

		const dependency = new Dependency({
			target,
			resourceHandler,
			chunk,
			context,
			environmentVariables
		});
		await dependency.findDependencies(namespaces);

		if (!options.disableNamespacesOptimization) {
			const uniqueNamespaces = new Set(namespaces);
			uniqueNamespaces.forEach((namespace: string) => context.variables.createNamespace(namespace));
		}

		if (!options.disableLiteralsOptimization) {
			literals.forEach((literal: ASTLiteral) => context.literals.add(literal));
		}

		return {
			main: {
				chunk,
				dependency
			},
			nativeImports
		};
	}
}