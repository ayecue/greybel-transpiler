import {
  ASTBooleanLiteral,
  ASTLiteral,
  ASTNumericLiteral,
  ASTType
} from 'miniscript-core';

export const getLiteralRawValue = (
  literal: ASTLiteral,
  allowShortened: boolean = false
): string => {
  switch (literal.type) {
    case ASTType.NilLiteral:
      return 'null';
    case ASTType.NumericLiteral: {
      const numericLiteral = literal as ASTNumericLiteral;
      return `${numericLiteral.negated ? '-' : ''}${numericLiteral.raw}`;
    }
    case ASTType.BooleanLiteral: {
      const booleanLiteral = literal as ASTBooleanLiteral;
      const value = allowShortened
        ? booleanLiteral.raw === 'true'
          ? '1'
          : '0'
        : booleanLiteral.raw;
      return `${booleanLiteral.negated ? '-' : ''}${value}`;
    }
    default:
      return literal.raw.toString();
  }
};

export const getLiteralValue = (literal: ASTLiteral): string => {
  switch (literal.type) {
    case ASTType.NilLiteral:
      return 'null';
    case ASTType.NumericLiteral: {
      const numericLiteral = literal as ASTNumericLiteral;
      return `${numericLiteral.negated ? '-' : ''}${numericLiteral.value}`;
    }
    case ASTType.BooleanLiteral: {
      const numericLiteral = literal as ASTBooleanLiteral;
      return `${numericLiteral.negated ? '-' : ''}${numericLiteral.value}`;
    }
    default:
      return literal.value.toString();
  }
};
