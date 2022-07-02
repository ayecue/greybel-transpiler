import path from 'path';
import {
	ASTChunkAdvanced,
	Parser,
	ASTFeatureIncludeExpression,
	ASTFeatureImportExpression
} from 'greybel-core';
import md5 from 'blueimp-md5';
import Context from './context';
import EventEmitter from 'events';
import { ResourceHandler } from './resource';

export interface DependencyOptions {
	target: string;
	resourceHandler: ResourceHandler;
	chunk: ASTChunkAdvanced;
	isInclude?: boolean;
	context: Context;
	environmentVariables?: Map<string, string>;
}

export default class Dependency extends EventEmitter {
	target: string;
	id: string;
	resourceHandler: ResourceHandler;
	chunk: ASTChunkAdvanced;
	dependencies: Dependency[];
	isInclude: boolean;
	context: Context;
	environmentVariables: Map<string, string>;

	constructor(options: DependencyOptions) {
		super();

		const me = this;

		me.target = options.target;
		me.id = md5(options.target);
		me.resourceHandler = options.resourceHandler;
		me.chunk = options.chunk;
		me.dependencies = [];
		me.isInclude = options.isInclude || false;
		me.context = options.context;
		me.environmentVariables = options.environmentVariables || new Map();;

		if (!me.context.data.has('globalDependencyMap')) {
			me.context.data.set('globalDependencyMap', new Map<string, Dependency>())
		}

		const namespace = me.context.modules.createNamespace(me.id);
		const globalDependencyMap: Map<string, Dependency> = me.context.data.get('globalDependencyMap');

		globalDependencyMap.set(namespace, me);
	}

	getId(): string {
		return this.id;
	}

	async findDependencies(namespaces: string[]): Promise<Dependency[]> {
		const me = this;
		const globalDependencyMap: Map<string, Dependency> = me.context.data.get('globalDependencyMap');
		const resourceHandler = me.resourceHandler;
		const context = me.context;
		const environmentVariables = me.environmentVariables;
		const items = [
			...me.chunk.imports,
			...me.chunk.includes
		];
		const result = [];
		let item;

		for (item of items) {
			const subTarget = await resourceHandler.getTargetRelativeTo(me.target, item.path);
			const id = md5(subTarget);
			const namespace = context.modules.get(id);

			if (globalDependencyMap.has(namespace)) {
				const dependency = globalDependencyMap.get(namespace);
				item.chunk = dependency.chunk;
				item.namespace = namespace;
				result.push(dependency);
				continue;
			}

			if (!await resourceHandler.has(subTarget)) {
				throw new Error('Dependency ' + subTarget + ' does not exist...');
			}

			const isInclude = (item as ASTFeatureIncludeExpression).type === 'FeatureIncludeExpression';
			const content = await resourceHandler.get(subTarget);

			me.emit('parse-before', subTarget);

			const parser = new Parser(content, { environmentVariables });
			const chunk = parser.parseChunk() as ASTChunkAdvanced;

			namespaces.push(...Array.from(chunk.namespaces));
			item.chunk = chunk;

			const dependency = new Dependency({
				target: subTarget,
				resourceHandler,
				chunk,
				isInclude,
				context,
				environmentVariables
			});
			await dependency.findDependencies(namespaces);

			item.namespace = context.modules.get(id);

			me.emit('parse-after', dependency);

			result.push(dependency);
		}
		
		me.dependencies = result;
		
		return result;
	}
}