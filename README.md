# greybel-transpiler

[![greybel-transpiler](https://circleci.com/gh/ayecue/greybel-transpiler.svg?style=svg)](https://circleci.com/gh/ayecue/greybel-transpiler)

A transpiler for [MiniScript](https://miniscript.org) written in TypeScript. It transforms MiniScript source files into deployable code and is built on top of [greybel-core](../greybel-core). For GreyScript-specific transpilation, see [greyscript-transpiler](../greyscript-transpiler).

## Features

* Three build modes: **default**, **beautify**, and **uglify**
* Automatic dependency resolution for `#include` and `#import` directives
* Variable and module namespace obfuscation
* Environment variable injection at transpile time
* `DirectTranspiler` for quick single-file transpilation without resource loading
* `Transpiler` for full multi-file builds with dependency graphs and installer output
* Literal deduplication and namespace generation for compact output
* Written in TypeScript with type definitions included

## Install

```
npm install greybel-transpiler
```

## Usage

### Single file (DirectTranspiler)

```ts
import { DirectTranspiler, BuildType } from 'greybel-transpiler';

const result = new DirectTranspiler({
  code: 'print "hello world"',
  buildType: BuildType.BEAUTIFY,
  obfuscation: false
}).parse();

console.log(result);
```

### Multi-file project (Transpiler)

```ts
import { Transpiler, BuildType } from 'greybel-transpiler';

const result = await new Transpiler({
  target: '/path/to/main.src',
  buildType: BuildType.DEFAULT,
  obfuscation: true,
  installer: true,
  environmentVariables: new Map([['VERSION', '"1.0.0"']])
}).parse();

// result is a record of output filename → transpiled code
console.log(result);
```

## Build Types

| Type | Description |
|------|-------------|
| `BuildType.DEFAULT` | Emits code with minimal transformation |
| `BuildType.BEAUTIFY` | Pretty-prints the output with configurable indentation |
| `BuildType.UGLIFY` | Minifies the output for smaller file size |

## Testing

```
npm test
```