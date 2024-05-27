import {
  ASTFeatureEnvarExpression,
  ASTFeatureFileExpression,
  ASTFeatureImportExpression,
  ASTFeatureIncludeExpression
} from 'greybel-core';
import {
  ASTAssignmentStatement,
  ASTBase,
  ASTBaseBlock,
  ASTCallExpression,
  ASTCallStatement,
  ASTChunk,
  ASTComment,
  ASTElseClause,
  ASTEvaluationExpression,
  ASTForGenericStatement,
  ASTFunctionStatement,
  ASTIdentifier,
  ASTIfClause,
  ASTIfStatement,
  ASTIndexExpression,
  ASTListConstructorExpression,
  ASTListValue,
  ASTLiteral,
  ASTMapConstructorExpression,
  ASTMapKeyString,
  ASTMemberExpression,
  ASTParenthesisExpression,
  ASTReturnStatement,
  ASTSliceExpression,
  ASTUnaryExpression,
  ASTWhileStatement
} from 'miniscript-core';
import { basename } from 'path';

import { Context } from '../context';
import { TransformerDataObject } from '../transformer';
import { BuildMap } from './default';

const processBlock = (
  block: ASTBaseBlock,
  process: (item: ASTBase) => string
): string[] => {
  const body: string[] = [];
  let index = block.start.line + 1;
  let bodyItem;

  for (bodyItem of block.body) {
    for (; index < bodyItem.start.line; index++) {
      body.push('');
    }

    body.push(process(bodyItem));
    index = bodyItem.end.line + 1;
  }

  for (; index < block.end.line; index++) {
    body.push('');
  }

  return body;
};

const isShorthandAssignmentWithIdentifier = (item: ASTAssignmentStatement) => {
  const varibale = item.variable;
  const init = item.init;
  return (
    varibale instanceof ASTIdentifier &&
    init instanceof ASTEvaluationExpression &&
    init.left instanceof ASTIdentifier &&
    varibale.name === init.left.name &&
    ['*', '+', '-', '^', '/'].includes(init.operator)
  );
};

const isShorthandAssignmentWithMemberExpression = (
  item: ASTAssignmentStatement
) => {
  const varibale = item.variable;
  const init = item.init;
  return (
    varibale instanceof ASTMemberExpression &&
    init instanceof ASTEvaluationExpression &&
    init.left instanceof ASTMemberExpression &&
    ['*', '+', '-', '^', '/'].includes(init.operator)
  );
};

export function beautifyFactory(
  make: (item: ASTBase, _data?: TransformerDataObject) => string,
  context: Context,
  environmentVariables: Map<string, string>
): BuildMap {
  let indent = 0;
  let isMultilineAllowed = true;
  const disableMultiline = () => (isMultilineAllowed = false);
  const enableMultiline = () => (isMultilineAllowed = true);
  const incIndent = () => indent++;
  const decIndent = () => indent--;
  const putIndent = (str: string, offset: number = 0) =>
    `${'\t'.repeat(indent + offset)}${str}`;

  return {
    ParenthesisExpression: (
      item: ASTParenthesisExpression,
      _data: TransformerDataObject
    ): string => {
      const expr = make(item.expression);

      return '(' + expr + ')';
    },
    Comment: (item: ASTComment, _data: TransformerDataObject): string => {
      if (item.isMultiline) {
        return item.value
          .split('\n')
          .map((line) => `//${line}`)
          .join('\n');
      }

      return '//' + item.value;
    },
    AssignmentStatement: (
      item: ASTAssignmentStatement,
      _data: TransformerDataObject
    ): string => {
      const varibale = item.variable;
      const init = item.init;

      // might can create shorthand for expression
      if (isShorthandAssignmentWithIdentifier(item)) {
        const expr = init as ASTEvaluationExpression;
        const left = make(varibale);
        const right = make(expr.right);

        return left + ' ' + expr.operator + '= ' + right;
      } else if (isShorthandAssignmentWithMemberExpression(item)) {
        const expr = init as ASTEvaluationExpression;
        const left = make(varibale);
        const temp = make(expr.left);

        if (left === temp) {
          const right = make(expr.right);
          return left + ' ' + expr.operator + '= ' + right;
        }
      }

      const left = make(varibale);
      const right = make(init);

      return left + ' = ' + right;
    },
    MemberExpression: (
      item: ASTMemberExpression,
      _data: TransformerDataObject
    ): string => {
      const identifier = make(item.identifier);
      const base = make(item.base);

      return [base, identifier].join(item.indexer);
    },
    FunctionDeclaration: (
      item: ASTFunctionStatement,
      _data: TransformerDataObject
    ): string => {
      const parameters = [];
      let parameterItem;

      disableMultiline();

      for (parameterItem of item.parameters) {
        parameters.push(make(parameterItem));
      }

      enableMultiline();

      incIndent();

      const body = processBlock(item, (bodyItem) => {
        const transformed = make(bodyItem);
        return putIndent(transformed);
      });

      decIndent();

      return (
        'function(' +
        parameters.join(', ') +
        ')\n' +
        body.join('\n') +
        '\n' +
        putIndent('end function')
      );
    },
    MapConstructorExpression: (
      item: ASTMapConstructorExpression,
      _data: TransformerDataObject
    ): string => {
      if (item.fields.length === 0) {
        return '{}';
      }

      if (item.fields.length === 1) {
        const field = make(item.fields[0]);
        return '{ ' + field + ' }';
      }

      const fields = [];
      let fieldItem;

      if (isMultilineAllowed) {
        incIndent();

        for (fieldItem of item.fields) {
          fields.push(make(fieldItem));
        }

        decIndent();

        return (
          '{\n' +
          fields.map((field) => putIndent(field, 1)).join(',\n') +
          ',\n' +
          putIndent('}')
        );
      }

      for (fieldItem of item.fields) {
        fields.push(make(fieldItem));
      }

      return (
        '{ ' + fields.map((field) => putIndent(field, 1)).join(', ') + ' }'
      );
    },
    MapKeyString: (
      item: ASTMapKeyString,
      _data: TransformerDataObject
    ): string => {
      const key = make(item.key);
      const value = make(item.value);

      return [key, value].join(': ');
    },
    Identifier: (item: ASTIdentifier, _data: TransformerDataObject): string => {
      return item.name;
    },
    ReturnStatement: (
      item: ASTReturnStatement,
      _data: TransformerDataObject
    ): string => {
      const arg = item.argument ? make(item.argument) : '';
      return 'return ' + arg;
    },
    NumericLiteral: (
      item: ASTLiteral,
      _data: TransformerDataObject
    ): string => {
      return item.value.toString();
    },
    WhileStatement: (
      item: ASTWhileStatement,
      _data: TransformerDataObject
    ): string => {
      const condition = make(item.condition);

      incIndent();

      const body = processBlock(item, (bodyItem) => {
        const transformed = make(bodyItem);
        return putIndent(transformed);
      });

      decIndent();

      return (
        'while ' +
        condition +
        '\n' +
        body.join('\n') +
        '\n' +
        putIndent('end while')
      );
    },
    CallExpression: (
      item: ASTCallExpression,
      _data: TransformerDataObject
    ): string => {
      const base = make(item.base);

      if (item.arguments.length === 0) {
        return base;
      }

      let argItem;
      const args = [];

      if (item.arguments.length > 3 && isMultilineAllowed) {
        incIndent();

        for (argItem of item.arguments) {
          args.push(make(argItem));
        }

        decIndent();

        return (
          base +
          '(\n' +
          args.map((item) => putIndent(item, 1)).join(',\n') +
          '\n' +
          putIndent(')')
        );
      }

      for (argItem of item.arguments) {
        args.push(make(argItem));
      }

      const argStr = args.join(', ');

      return base + '(' + argStr + ')';
    },
    StringLiteral: (item: ASTLiteral, _data: TransformerDataObject): string => {
      return item.raw.toString();
    },
    SliceExpression: (
      item: ASTSliceExpression,
      _data: TransformerDataObject
    ): string => {
      const base = make(item.base);
      const left = make(item.left);
      const right = make(item.right);

      return base + '[' + [left, right].join(' : ') + ']';
    },
    IndexExpression: (
      item: ASTIndexExpression,
      _data: TransformerDataObject
    ): string => {
      const base = make(item.base);
      const index = make(item.index);

      return base + '[' + index + ']';
    },
    UnaryExpression: (
      item: ASTUnaryExpression,
      _data: TransformerDataObject
    ): string => {
      const arg = make(item.argument);

      if (item.operator === 'new') return item.operator + ' ' + arg;

      return item.operator + arg;
    },
    NegationExpression: (
      item: ASTUnaryExpression,
      _data: TransformerDataObject
    ): string => {
      const arg = make(item.argument);

      return 'not ' + arg;
    },
    FeatureEnvarExpression: (
      item: ASTFeatureEnvarExpression,
      _data: TransformerDataObject
    ): string => {
      const value = environmentVariables.get(item.name);
      if (!value) return 'null';
      return `"${value}"`;
    },
    IfShortcutStatement: (
      item: ASTIfStatement,
      _data: TransformerDataObject
    ): string => {
      const clauses = [];
      let clausesItem;

      for (clausesItem of item.clauses) {
        clauses.push(make(clausesItem));
      }

      return clauses.join('\n') + '\n' + putIndent('end if');
    },
    IfShortcutClause: (
      item: ASTIfClause,
      _data: TransformerDataObject
    ): string => {
      const condition = make(item.condition);

      incIndent();
      const statement = putIndent(make(item.body[0]));
      decIndent();

      return '\n' + putIndent('if ' + condition + ' then') + '\n' + statement;
    },
    ElseifShortcutClause: (
      item: ASTIfClause,
      _data: TransformerDataObject
    ): string => {
      const condition = make(item.condition);

      incIndent();
      const statement = putIndent(make(item.body[0]));
      decIndent();

      return 'else if ' + condition + ' then\n' + statement;
    },
    ElseShortcutClause: (
      item: ASTElseClause,
      _data: TransformerDataObject
    ): string => {
      incIndent();
      const statement = putIndent(make(item.body[0]));
      decIndent();

      return 'else\n' + statement;
    },
    NilLiteral: (_item: ASTLiteral, _data: TransformerDataObject): string => {
      return 'null';
    },
    ForGenericStatement: (
      item: ASTForGenericStatement,
      _data: TransformerDataObject
    ): string => {
      const variable = make(item.variable);
      const iterator = make(item.iterator);

      incIndent();

      const body = processBlock(item, (bodyItem) => {
        const transformed = make(bodyItem);
        return putIndent(transformed);
      });

      decIndent();

      return (
        'for ' +
        variable +
        ' in ' +
        iterator +
        '\n' +
        body.join('\n') +
        '\n' +
        putIndent('end for')
      );
    },
    IfStatement: (
      item: ASTIfStatement,
      _data: TransformerDataObject
    ): string => {
      const clauses = [];
      let clausesItem;

      for (clausesItem of item.clauses) {
        clauses.push(make(clausesItem));
      }

      return clauses.join('\n') + '\n' + putIndent('end if');
    },
    IfClause: (item: ASTIfClause, _data: TransformerDataObject): string => {
      const condition = make(item.condition);

      incIndent();

      const body = processBlock(item, (bodyItem) => {
        const transformed = make(bodyItem);
        return putIndent(transformed);
      });

      decIndent();

      return 'if ' + condition + ' then' + '\n' + body.join('\n');
    },
    ElseifClause: (item: ASTIfClause, _data: TransformerDataObject): string => {
      const condition = make(item.condition);

      incIndent();

      const body = processBlock(item, (bodyItem) => {
        const transformed = make(bodyItem);
        return putIndent(transformed);
      });

      decIndent();

      return (
        putIndent('else if') + ' ' + condition + ' then\n' + body.join('\n')
      );
    },
    ElseClause: (item: ASTElseClause, _data: TransformerDataObject): string => {
      incIndent();

      const body = processBlock(item, (bodyItem) => {
        const transformed = make(bodyItem);
        return putIndent(transformed);
      });

      decIndent();

      return putIndent('else') + '\n' + body.join('\n');
    },
    ContinueStatement: (
      _item: ASTBase,
      _data: TransformerDataObject
    ): string => {
      return 'continue';
    },
    BreakStatement: (_item: ASTBase, _data: TransformerDataObject): string => {
      return 'break';
    },
    CallStatement: (
      item: ASTCallStatement,
      _data: TransformerDataObject
    ): string => {
      return make(item.expression);
    },
    FeatureImportExpression: (
      item: ASTFeatureImportExpression,
      _data: TransformerDataObject
    ): string => {
      if (!item.chunk) {
        return '#import "' + make(item.name) + ' from ' + item.path + '";';
      }

      return make(item.name) + ' = __REQUIRE("' + item.namespace + '")';
    },
    FeatureIncludeExpression: (
      item: ASTFeatureIncludeExpression,
      _data: TransformerDataObject
    ): string => {
      if (!item.chunk) {
        return '#include "' + item.path + '";';
      }

      return make(item.chunk);
    },
    FeatureDebuggerExpression: (
      _item: ASTBase,
      _data: TransformerDataObject
    ): string => {
      return '//debugger';
    },
    FeatureLineExpression: (
      item: ASTBase,
      _data: TransformerDataObject
    ): string => {
      return `${item.start.line}`;
    },
    FeatureFileExpression: (
      item: ASTFeatureFileExpression,
      _data: TransformerDataObject
    ): string => {
      return `"${basename(item.filename).replace(/"/g, '"')}"`;
    },
    ListConstructorExpression: (
      item: ASTListConstructorExpression,
      _data: TransformerDataObject
    ): string => {
      if (item.fields.length === 0) {
        return '[]';
      }

      if (item.fields.length === 1) {
        const field = make(item.fields[0]);
        return '[ ' + field + ' ]';
      }

      const fields = [];
      let fieldItem;

      if (isMultilineAllowed) {
        incIndent();

        for (fieldItem of item.fields) {
          fields.push(make(fieldItem));
        }

        decIndent();

        return (
          '[\n' +
          fields.map((field) => putIndent(field, 1)).join(',\n') +
          ',\n' +
          putIndent(']')
        );
      }

      for (fieldItem of item.fields) {
        fields.push(make(fieldItem));
      }

      return '[ ' + fields.join(', ') + ' ]';
    },
    ListValue: (item: ASTListValue, _data: TransformerDataObject): string => {
      return make(item.value);
    },
    BooleanLiteral: (
      item: ASTLiteral,
      _data: TransformerDataObject
    ): string => {
      return item.raw.toString();
    },
    EmptyExpression: (_item: ASTBase, _data: TransformerDataObject): string => {
      return '';
    },
    IsaExpression: (
      item: ASTEvaluationExpression,
      _data: TransformerDataObject
    ): string => {
      const left = make(item.left);
      const right = make(item.right);

      return left + ' ' + item.operator + ' ' + right;
    },
    LogicalExpression: (
      item: ASTEvaluationExpression,
      _data: TransformerDataObject
    ): string => {
      const left = make(item.left);
      const right = make(item.right);

      return left + ' ' + item.operator + ' ' + right;
    },
    BinaryExpression: (
      item: ASTEvaluationExpression,
      _data: TransformerDataObject
    ): string => {
      const left = make(item.left);
      const right = make(item.right);
      const operator = item.operator;
      let expression = left + ' ' + operator + ' ' + right;

      if (operator === '|') {
        expression = 'bitOr(' + [left, right].join(', ') + ')';
      } else if (operator === '&') {
        expression = 'bitAnd(' + [left, right].join(', ') + ')';
      } else if (operator === '<<' || operator === '>>' || operator === '>>>') {
        throw new Error('Operators in binary expression are not supported');
      }

      return expression;
    },
    BinaryNegatedExpression: (
      item: ASTUnaryExpression,
      _data: TransformerDataObject
    ): string => {
      const arg = make(item.argument);
      const operator = item.operator;

      return operator + arg;
    },
    Chunk: (item: ASTChunk, _data: TransformerDataObject): string => {
      return processBlock(item, (bodyItem) => {
        const transformed = make(bodyItem);
        return putIndent(transformed);
      }).join('\n');
    }
  };
}
