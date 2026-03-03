import {
  ASTBase,
  ASTFunctionStatement,
  ASTListValue,
  ASTMapKeyString,
  ASTType
} from 'miniscript-core';

export function getOverflowingFunction(
  field: ASTBase,
  containerEndLine: number
): ASTFunctionStatement | null {
  let value: ASTBase | undefined;
  if (field instanceof ASTListValue) value = field.value;
  else if (field instanceof ASTMapKeyString) value = field.value;
  else value = field;

  if (
    value?.type === ASTType.FunctionDeclaration &&
    value.endLine > containerEndLine
  ) {
    return value as ASTFunctionStatement;
  }
  return null;
}
