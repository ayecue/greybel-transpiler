import { ASTChunkGreybel, Parser } from 'greybel-core';

export const HEADER_BOILERPLATE: ASTChunkGreybel = new Parser(
  `MODULES={}
	EXPORTED={}
  __REQUIRE_EVAL=function(cb, ns)
    if EXPORTED.hasIndex(ns) then return EXPORTED[ns]
    result=cb(ns)
    if result == null then result = { "exports": null }
    if not result.hasIndex("exports") then result.exports = null
    EXPORTED[ns]=result
    return result
  end function
	__REQUIRE=function(ns)
	if not MODULES.hasIndex(ns) then
	print("Module "+ns+" cannot be found...")
	return null
	end if
	return @__REQUIRE_EVAL(@MODULES[ns],ns).exports
	end function`
).parseChunk() as ASTChunkGreybel;

export const MODULE_BOILERPLATE: ASTChunkGreybel = new Parser(
  `MODULES["$0"]=function(r)
	module={}
	"$1"
	return module
	end function`
).parseChunk() as ASTChunkGreybel;

export const MAIN_BOILERPLATE: ASTChunkGreybel = new Parser(
  `"$0"`
).parseChunk() as ASTChunkGreybel;
