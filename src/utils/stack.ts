import { ASTBase } from 'miniscript-core';

export class Stack {
  currentStack: ASTBase[];

  constructor() {
    const me = this;
    me.currentStack = [];
  }

  get(offset: number): ASTBase {
    const me = this;
    const currentStack = me.currentStack;
    if (offset == null) offset = 0;
    const index = currentStack.length - offset - 1;
    if (index < 0) return null;
    return currentStack[index];
  }

  depth(): number {
    return this.currentStack.filter(function (item) {
      return Object.prototype.hasOwnProperty.call(item, 'body');
    }).length;
  }

  lookup(cb: Function): boolean {
    const me = this;

    for (let index = me.currentStack.length - 2; index >= 0; index--) {
      if (cb(me.currentStack[index])) return true;
    }

    return false;
  }

  push(o: ASTBase): Stack {
    const me = this;
    me.currentStack.push(o);
    return me;
  }

  pop(): Stack {
    const me = this;
    me.currentStack.pop();
    return me;
  }
}
