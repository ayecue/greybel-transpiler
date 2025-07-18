import { Resource } from './resource';

export interface ResourceManagerLike {
  getResource(target: string): Resource | null;
  getInjection(target: string): string | null;
  getRelativePathMapping(target: string, relativePath: string): string | null;
  getEntryPointResource(): Resource | null;
  load(target: string): Promise<void>;
  isSuccess(): boolean;
}
