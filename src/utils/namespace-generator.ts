export interface NamespaceGeneratorOptions {
  characters?: string;
  forbidden?: string[];
  defaultNamespaces?: string[];
}

export default class NamespaceGenerator {
  buffer: number[];
  mapping: Map<string, string>;
  rmapping: Map<string, string>;
  forbidden: string[];
  characters: string | null;
  defaultNamespaces: string[];

  constructor(options: NamespaceGeneratorOptions) {
    const me = this;

    me.buffer = [0];
    me.mapping = new Map();
    me.rmapping = new Map();
    me.forbidden = options.forbidden || [];
    me.characters = options.characters || null;
    me.defaultNamespaces = options.defaultNamespaces || [];

    for (const defaultNamespace of me.defaultNamespaces) {
      me.createNamespace(defaultNamespace);
    }
  }

  exclude(namespace: string): NamespaceGenerator {
    const me = this;

    if (Array.isArray(namespace)) {
      me.forbidden = me.forbidden.concat(namespace);
    } else {
      me.forbidden.push(namespace);
    }

    return me;
  }

  setCharset(characters: string): NamespaceGenerator {
    const me = this;
    me.characters = characters;
    return me;
  }

  reset(): NamespaceGenerator {
    const me = this;
    me.buffer = [0];
    me.mapping = new Map();
    me.rmapping = new Map();
    return me;
  }

  get(key: string): string | null {
    const mapping = this.mapping;
    if (mapping.has(key)) return mapping.get(key);
    return null;
  }

  increaseBuffer(i?: number): NamespaceGenerator {
    const me = this;
    const currentCharBuffer = me.buffer;
    const maxBufferSize = me.characters.length;
    if (i == null) i = currentCharBuffer.length - 1;
    let p = currentCharBuffer[i];
    p = p + 1;
    currentCharBuffer[i] = p;
    if (p === maxBufferSize) {
      currentCharBuffer[i] = 0;
      if (i === 0) {
        currentCharBuffer.push(0);
      } else {
        me.increaseBuffer(i - 1);
      }
    }
    return me;
  }

  generateNamespace(): string {
    const me = this;
    const currentCharBuffer = me.buffer;
    const generatorCharacters = me.characters;
    const forbiddenNamespaces = me.forbidden;
    let name = '';
    let index = 0;
    let pointer;

    while (index < currentCharBuffer.length) {
      pointer = currentCharBuffer[index];
      name = name + generatorCharacters[pointer];
      if (index === currentCharBuffer.length - 1) me.increaseBuffer();
      index = index + 1;
    }

    if (forbiddenNamespaces.indexOf(name) !== -1) {
      return me.generateNamespace();
    }

    return name;
  }

  createNamespace(value: string, isCollision: boolean = false): string {
    const me = this;
    const mapping = me.mapping;
    const rmapping = me.rmapping;
    const forbiddenNamespaces = me.forbidden;

    if (forbiddenNamespaces.indexOf(value) !== -1) {
      return value;
    }

    if (mapping.has(value) && !isCollision) {
      return mapping.get(value);
    }

    let namespace = me.generateNamespace();

    mapping.set(value, namespace);
    rmapping.set(namespace, value);

    if (rmapping.has(value)) {
      const collisionValue = rmapping.get(value);
      rmapping.delete(value);
      namespace = me.createNamespace(collisionValue, true);
    }

    return namespace;
  }
}
