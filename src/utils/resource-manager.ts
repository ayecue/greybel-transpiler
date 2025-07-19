import EventEmitter from 'events';

import { Resource, ResourceLoadState } from '../types/resource';
import { ResourceManagerLike } from '../types/resource-manager';
import { BuildError } from './error';
import { ResourceHandler } from './resource-provider';
import { ChunkProviderLike } from '../types/chunk-provider';
import { ASTChunkGreybel } from 'greybel-core';

export interface ResourceManagerOptions {
  resourceHandler: ResourceHandler;
  chunkProvider: ChunkProviderLike;
}

export class ResourceManager
  extends EventEmitter
  implements ResourceManagerLike
{
  private resourceHandler: ResourceHandler;
  private chunkProvider: ChunkProviderLike;

  private loadStates: Map<string, ResourceLoadState>;
  private loadRequests: Map<string, Promise<Resource>>;

  protected entryPointResource: Resource | null;
  protected resources: Map<string, Resource>;
  protected injections: Map<string, string>;
  protected relativePathMappings: Map<string, string>;

  constructor(options: ResourceManagerOptions) {
    super();
    this.resourceHandler = options.resourceHandler;
    this.chunkProvider = options.chunkProvider;
    this.entryPointResource = null;

    this.loadStates = new Map<string, ResourceLoadState>();
    this.loadRequests = new Map<string, Promise<Resource>>();

    this.resources = new Map<string, Resource>();
    this.injections = new Map<string, string>();
    this.relativePathMappings = new Map<string, string>();
  }

  getResourceHandler(): ResourceHandler {
    return this.resourceHandler;
  }

  getChunkProvider(): ChunkProviderLike {
    return this.chunkProvider;
  }

  protected async createMapping(
    target: string,
    relativePath: string
  ): Promise<string> {
    const key = `${target}:${relativePath}`;
    const existingMapping = this.relativePathMappings.get(key);

    if (existingMapping !== undefined) {
      return existingMapping;
    }

    const relativePathMapping = await this.resourceHandler.getTargetRelativeTo(
      target,
      relativePath
    );

    this.relativePathMappings.set(key, relativePathMapping);

    return relativePathMapping;
  }

  protected async createInjection(target: string): Promise<string> {
    const cachedInjection = this.injections.get(target);

    if (cachedInjection !== undefined) {
      return cachedInjection;
    }

    if (!(await this.resourceHandler.has(target))) {
      throw new Error('Injection ' + target + ' does not exist...');
    }

    const content = await this.resourceHandler.get(target);
    this.injections.set(target, content);
  }

  protected async createResource(target: string): Promise<Resource> {
    const fileExists = await this.resourceHandler.has(target);

    if (!fileExists) {
      throw new Error('Dependency ' + target + ' does not exist...');
    }

    const content = await this.resourceHandler.get(target);
    this.emit('parse-before', target);
    const chunk = this.chunkProvider.parse(target, content);
    const resource: Resource = {
      target,
      chunk: chunk as ASTChunkGreybel
    };

    this.emit('parse-after', resource);

    return resource;
  }

  protected async enrichResource(resource: Resource): Promise<void> {
    const { imports, includes, injects } = resource.chunk;
    const resourcePaths = await Promise.all([
      ...imports.map(async (item) => {
        return this.createMapping(resource.target, item.path);
      }),
      ...includes.map(async (item) => {
        return this.createMapping(resource.target, item.path);
      })
    ]);

    await Promise.all([
      ...resourcePaths.map(async (resourcePath) => {
        await this.loadResource(resourcePath);
      }),
      ...injects.map(async (item) => {
        const depTarget = await this.createMapping(resource.target, item.path);
        await this.createInjection(depTarget);
      })
    ]);
  }

  protected async loadResource(target: string): Promise<Resource> {
    const pendingRequest = this.loadRequests.get(target);

    if (pendingRequest !== undefined) {
      return pendingRequest;
    }

    const cachedResource = this.resources.get(target);

    if (cachedResource !== undefined) {
      return cachedResource;
    }

    this.loadStates.set(target, ResourceLoadState.Pending);

    const resourceDefer = this.createResource(target);

    this.loadRequests.set(target, resourceDefer);

    let resource: Resource;

    try {
      resource = await resourceDefer;
    } catch (err) {
      throw new BuildError(err.message, {
        target,
        range: err.range
      });
    }

    this.resources.set(target, resource);
    this.loadRequests.delete(target);

    this.enrichResource(resource)
      .then(() => {
        this.loadStates.set(target, ResourceLoadState.Ready);
        this.emit('loaded', resource);
      })
      .catch((err: any) => {
        this.emit('error', err);
      });

    return resource;
  }

  isSuccess() {
    return Array.from(this.loadStates.values()).every(
      (state) => state === ResourceLoadState.Ready
    );
  }

  getEntryPointResource(): Resource | null {
    return this.entryPointResource;
  }

  getResource(target: string): Resource | null {
    return this.resources.get(target) || null;
  }

  getInjection(target: string): string | null {
    return this.injections.get(target) || null;
  }

  getRelativePathMapping(target: string, relativePath: string): string | null {
    const key = `${target}:${relativePath}`;
    return this.relativePathMappings.get(key) || null;
  }

  load(target: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const onComplete = (err?: Error) => {
        this.off('loaded', onLoad);
        this.off('error', onError);
        this.loadStates.clear();
        this.loadRequests.clear();
        if (err) return reject(err);
        resolve();
      };
      const onLoad = (resource: Resource) => {
        if (resource.target === target) {
          this.entryPointResource = resource;
        }

        if (this.isSuccess()) {
          onComplete();
        }
      };
      const onError = (err: Error) => {
        onComplete(err);
      };

      this.on('loaded', onLoad);
      this.on('error', onError);
      this.loadResource(target).catch((err: any) => onComplete(err));
    });
  }
}
