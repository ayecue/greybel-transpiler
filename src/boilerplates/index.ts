import { ASTChunkAdvanced, Parser } from 'greybel-core';

export const HEADER_BOILERPLATE: ASTChunkAdvanced = new Parser(
  `MODULES={}
	EXPORTED={}
	__REQUIRE=function(r)
	if (not MODULES.hasIndex(r)) then
	print("Module "+r+" cannot be found...")
	return null
	end if
	module=@MODULES[r]
	return @module(r).exports
	end function`
).parseChunk() as ASTChunkAdvanced;

export const MODULE_BOILERPLATE: ASTChunkAdvanced = new Parser(
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
).parseChunk() as ASTChunkAdvanced;

export const MAIN_BOILERPLATE: ASTChunkAdvanced = new Parser(
  `"$0"`
).parseChunk() as ASTChunkAdvanced;
