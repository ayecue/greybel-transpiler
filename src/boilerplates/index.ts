import { ASTChunk, Parser } from 'greybel-core';

export const HEADER_BOILERPLATE: ASTChunk = new Parser(
  `MODULES={}
	EXPORTED={}
	__REQUIRE=function(r)
	if (not MODULES.hasIndex(r)) then
	exit("Module "+r+" cannot be found...")
	end if
	module=MODULES[r]
	return @module(r).exports
	end function`
).parseChunk() as ASTChunk;

export const MODULE_BOILERPLATE: ASTChunk = new Parser(
  `MODULES["$0"]=function(r)
	module={}
	if (EXPORTED.hasIndex(r)) then
	module=EXPORTED[r]
	end if
	if (not module.hasIndex("exports")) then
	"$1"
	end if
	EXPORTED[r]=module
	return EXPORTED[r]
	end function`
).parseChunk() as ASTChunk;

export const MAIN_BOILERPLATE: ASTChunk = new Parser(
  `"$0"`
).parseChunk() as ASTChunk;
