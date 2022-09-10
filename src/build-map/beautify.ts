import {
  ASTAssignmentStatement,
  ASTBase,
  ASTCallExpression,
  ASTCallStatement,
  ASTChunk,
  ASTElseClause,
  ASTEvaluationExpression,
  ASTFeatureEnvarExpression,
  ASTFeatureImportExpression,
  ASTFeatureIncludeExpression,
  ASTForGenericStatement,
  ASTFunctionStatement,
  ASTIdentifier,
  ASTIfClause,
  ASTIfStatement,
  ASTImportCodeExpression,
  ASTIndexExpression,
  ASTListConstructorExpression,
  ASTListValue,
  ASTLiteral,
  ASTMapConstructorExpression,
  ASTMapKeyString,
  ASTMemberExpression,
  ASTReturnStatement,
  ASTSliceExpression,
  ASTUnaryExpression,
  ASTWhileStatement
} from 'greybel-core';

import Context from '../context';
import { TransformerDataObject } from '../transformer';
import { BuildMap } from './default';

const isBlock = (item: string) => {
  return /^[^\n]*(function|if|for|while)[^\n]*/.test(item);
};

export default function (
  make: (item: ASTBase, _data?: TransformerDataObject) => string,
  context: Context,
  environmentVariables: Map<string, string>
): BuildMap {
  let indent = 0;
  const incIndent = () => indent++;
  const decIndent = () => indent--;
  const putIndent = (str: string) => `${'\t'.repeat(indent)}${str}`

  return {
    AssignmentStatement: (
      item: ASTAssignmentStatement,
      _data: TransformerDataObject
    ): string => {
      const varibale = item.variable;
      const init = item.init;
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
      const body = [];
      let index = item.body.length - 1;
      let parameterItem;
      let bodyItem;

      incIndent();

      for (parameterItem of item.parameters) {
        parameters.push(make(parameterItem));
      }

      for (bodyItem of item.body) {
        const transformed = make(bodyItem);
        if (transformed === '') continue;
        if (isBlock(transformed) && body.length > 0 && body[body.length - 1] !== '') {
          body.push('');
        }

        body.push(putIndent(transformed));

        if (isBlock(transformed) && --index !== 0) {
          body.push('');
        }
      }

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
      const fields = [];
      let fieldItem;

      for (fieldItem of item.fields) {
        fields.push(make(fieldItem));
      }

      return '{' + fields.join(', ') + '}';
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
      const body = [];
      let index = item.body.length - 1;
      let bodyItem;

      incIndent();

      for (bodyItem of item.body) {
        const transformed = make(bodyItem);
        if (transformed === '') continue;
        if (isBlock(transformed) && body.length > 0 && body[body.length - 1] !== '') {
          body.push('');
        }

        body.push(putIndent(transformed));

        if (isBlock(transformed) && --index !== 0) {
          body.push('');
        }
      }

      decIndent();

      return 'while ' + condition + '\n' + body.join('\n') + '\n' + putIndent('end while');
    },
    CallExpression: (
      item: ASTCallExpression,
      _data: TransformerDataObject
    ): string => {
      const base = make(item.base);
      const args = [];
      let argItem;

      for (argItem of item.arguments) {
        args.push(make(argItem));
      }

      return base + '(' + args.join(', ') + ')';
    },
    StringLiteral: (item: ASTLiteral, _data: TransformerDataObject): string => {
      return item.raw.toString();
    },
    SliceExpression: (
      item: ASTSliceExpression,
      _data: TransformerDataObject
    ): string => {
      const left = make(item.left);
      const right = make(item.right);

      return [left, right].join(' : ');
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

      if (item.operator === 'new') return '(' + item.operator + ' ' + arg + ')';

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
      const body = [];
      let index = item.body.length - 1;
      let bodyItem;

      incIndent();

      for (bodyItem of item.body) {
        const transformed = make(bodyItem);
        if (transformed === '') continue;
        if (isBlock(transformed) && body.length > 0 && body[body.length - 1] !== '') {
          body.push('');
        }

        body.push(putIndent(transformed));

        if (isBlock(transformed) && --index !== 0) {
          body.push('');
        }
      }

      decIndent();

      return (
        'for ' + variable + ' in ' + iterator +
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
      const body = [];
      let index = item.body.length - 1;
      let bodyItem;

      incIndent();

      for (bodyItem of item.body) {
        const transformed = make(bodyItem);
        if (transformed === '') continue;
        if (isBlock(transformed) && body.length > 0 && body[body.length - 1] !== '') {
          body.push('');
        }

        body.push(putIndent(transformed));

        if (isBlock(transformed) && --index !== 0) {
          body.push('');
        }
      }

      decIndent();

      return 'if ' + condition + ' then' + '\n' + body.join('\n');
    },
    ElseifClause: (item: ASTIfClause, _data: TransformerDataObject): string => {
      const condition = make(item.condition);
      const body = [];
      let index = item.body.length - 1;
      let bodyItem;

      incIndent();

      for (bodyItem of item.body) {
        const transformed = make(bodyItem);
        if (transformed === '') continue;
        if (isBlock(transformed) && body.length > 0 && body[body.length - 1] !== '') {
          body.push('');
        }

        body.push(putIndent(transformed));

        if (isBlock(transformed) && --index !== 0) {
          body.push('');
        }
      }

      decIndent();

      return putIndent('else if') + ' ' + condition + ' then\n' + body.join('\n');
    },
    ElseClause: (item: ASTElseClause, _data: TransformerDataObject): string => {
      const body = [];
      let index = item.body.length - 1;
      let bodyItem;

      incIndent();

      for (bodyItem of item.body) {
        const transformed = make(bodyItem);
        if (transformed === '') continue;
        if (isBlock(transformed) && body.length > 0 && body[body.length - 1] !== '') {
          body.push('');
        }

        body.push(putIndent(transformed));

        if (isBlock(transformed) && --index !== 0) {
          body.push('');
        }
      }

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
      return make(item.name) + ' = __REQUIRE("' + item.namespace + '")';
    },
    FeatureIncludeExpression: (
      item: ASTFeatureIncludeExpression,
      _data: TransformerDataObject
    ): string => {
      return make(item.chunk);
    },
    FeatureDebuggerExpression: (
      _item: ASTBase,
      _data: TransformerDataObject
    ): string => {
      return '//debugger';
    },
    ListConstructorExpression: (
      item: ASTListConstructorExpression,
      _data: TransformerDataObject
    ): string => {
      const fields = [];
      let fieldItem;

      for (fieldItem of item.fields) {
        fields.push(make(fieldItem));
      }

      return '[' + fields.join(', ') + ']';
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
    LogicalExpression: (
      item: ASTEvaluationExpression,
      _data: TransformerDataObject
    ): string => {
      const left = make(item.left);
      const right = make(item.right);
      const expression = [left, item.operator, right].join(' ');

      return '(' + expression + ')';
    },
    BinaryExpression: (
      item: ASTEvaluationExpression,
      _data: TransformerDataObject
    ): string => {
      const left = make(item.left);
      const right = make(item.right);
      const operator = item.operator;
      let expression = [left, operator, right].join(' ');

      if (
        operator === '<<' ||
        operator === '>>' ||
        operator === '>>>' ||
        operator === '|' ||
        operator === '&' ||
        operator === '^'
      ) {
        expression =
          'bitwise(' + ['"' + operator + '"', left, right].join(', ') + ')';
      } else {
        expression = [left, operator, right].join(' ');
      }

      return '(' + expression + ')';
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
      const body = [];
      let index = item.body.length - 1;
      let bodyItem;

      for (bodyItem of item.body) {
        const transformed = make(bodyItem);
        if (transformed === '') continue;
        if (isBlock(transformed) && body.length > 0 && body[body.length - 1] !== '') {
          body.push('');
        }

        body.push(putIndent(transformed));

        if (isBlock(transformed) && --index !== 0) {
          body.push('');
        }
      }

      return body.join('\n');
    },
    ImportCodeExpression: (
      item: ASTImportCodeExpression,
      _data: TransformerDataObject
    ): string => {
      const dir = `"${item.gameDirectory}"`;
      return 'import_code(' + dir + ')';
    }
  };
}