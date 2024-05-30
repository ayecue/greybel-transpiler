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
  ASTPosition,
  ASTReturnStatement,
  ASTSliceExpression,
  ASTUnaryExpression,
  ASTWhileStatement
} from 'miniscript-core';
import { basename } from 'path';

import { Context } from '../context';
import { TransformerDataObject } from '../transformer';
import {
  countEvaluationExpressions,
  SHORTHAND_OPERATORS,
  transformBitOperation,
  unwrap
} from './beautify/utils';
import { BuildMap } from './default';

export function beautifyFactory(
  make: (item: ASTBase, _data?: TransformerDataObject) => string,
  context: Context,
  environmentVariables: Map<string, string>
): BuildMap {
  let indent = 0;
  let isMultilineAllowed = true;
  const chunks: ASTChunk['lines'][] = [];
  const usedComments: Set<ASTBase> = new Set();
  const pushLines = (lines: ASTChunk['lines']) => chunks.push(lines);
  const popLines = (): ASTChunk['lines'] => chunks.pop();
  const getLines = (): ASTChunk['lines'] => chunks[chunks.length - 1];
  const appendComment = (position: ASTPosition, line: string): string => {
    const items = getLines().get(position.line);
    const comment = items?.find(
      (item) => item instanceof ASTComment
    ) as ASTComment;

    if (comment && !usedComments.has(comment)) {
      usedComments.add(comment);
      return line + ' //' + comment.value;
    }

    return line;
  };
  const disableMultiline = () => (isMultilineAllowed = false);
  const enableMultiline = () => (isMultilineAllowed = true);
  const incIndent = () => indent++;
  const decIndent = () => indent--;
  const putIndent = (str: string, offset: number = 0) =>
    `${'\t'.repeat(indent + offset)}${str}`;
  const buildBlock = (block: ASTBaseBlock): string[] => {
    const body: string[] = [];
    let previous: ASTBase | null = null;

    for (let index = 0; index < block.body.length; index++) {
      const bodyItem = block.body[index];

      if (
        (bodyItem instanceof ASTComment &&
          getLines().get(bodyItem.start.line).length > 1) ||
        previous?.end.line === bodyItem.start.line ||
        usedComments.has(bodyItem)
      ) {
        continue;
      }

      const diff = Math.max(
        previous ? bodyItem.start.line - previous.end.line - 1 : 0,
        0
      );

      for (let j = 0; j < diff; j++) {
        body.push('');
      }

      if (bodyItem instanceof ASTComment) {
        usedComments.add(bodyItem);
        const transformed = make(bodyItem, { isCommand: true });
        body.push(putIndent(transformed));
      } else {
        const transformed = make(bodyItem, { isCommand: true });
        body.push(putIndent(appendComment(bodyItem.end, transformed)));
      }

      previous = bodyItem;
    }

    const last = block.body[block.body.length - 1];

    body.push(
      ...new Array(Math.max(block.end.line - last?.end?.line - 1, 0)).fill(' ')
    );

    return body;
  };

  return {
    ParenthesisExpression: (
      item: ASTParenthesisExpression,
      _data: TransformerDataObject
    ): string => {
      const expr = make(item.expression);

      if (/\n/.test(expr) && !/,(?!\n)/.test(expr)) {
        return '\t(' + expr + ')';
      }

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
      const left = make(varibale);
      const right = make(init);

      // might can create shorthand for expression
      if (
        (varibale instanceof ASTIdentifier ||
          varibale instanceof ASTMemberExpression) &&
        right.startsWith(left)
      ) {
        const segments = right.split(' ');
        const [_, operator, ...rightSegments] = segments;

        if (SHORTHAND_OPERATORS.includes(operator)) {
          return left + ' ' + operator + '= ' + rightSegments.join(' ');
        }
      }

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

      const blockStart = appendComment(
        item.start,
        'function(' + parameters.join(', ') + ')'
      );
      const blockEnd = putIndent('end function');

      incIndent();

      const body = buildBlock(item);

      decIndent();

      return blockStart + '\n' + body.join('\n') + '\n' + blockEnd;
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
        return appendComment(item.fields[0].end, '{ ' + field + ' }');
      }

      if (isMultilineAllowed) {
        const fields = [];
        const blockEnd = putIndent(appendComment(item.start, '}'));

        incIndent();

        for (let index = item.fields.length - 1; index >= 0; index--) {
          const fieldItem = item.fields[index];
          fields.unshift(appendComment(fieldItem.end, make(fieldItem) + ','));
        }

        decIndent();

        const blockStart = appendComment(item.start, '{');

        return (
          blockStart +
          '\n' +
          fields.map((field) => putIndent(field, 1)).join('\n') +
          '\n' +
          blockEnd
        );
      }

      const fields = [];
      let fieldItem;
      const blockStart = '{';
      const blockEnd = appendComment(item.start, '}');

      for (fieldItem of item.fields) {
        fields.push(make(fieldItem));
      }

      return (
        blockStart +
        ' ' +
        fields.map((field) => putIndent(field, 1)).join(', ') +
        ' ' +
        blockEnd
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
      const condition = make(unwrap(item.condition));
      const blockStart = appendComment(item.start, 'while ' + condition);
      const blockEnd = putIndent('end while');

      incIndent();

      const body = buildBlock(item);

      decIndent();

      return blockStart + '\n' + body.join('\n') + '\n' + blockEnd;
    },
    CallExpression: (
      item: ASTCallExpression,
      data: TransformerDataObject
    ): string => {
      const base = make(item.base);

      if (item.arguments.length === 0) {
        return base;
      }

      let argItem;
      const args = [];

      for (argItem of item.arguments) {
        args.push(make(argItem));
      }

      const argStr = args.join(', ');

      if (/\n/.test(argStr) && !/,(?!\n)/.test(argStr)) {
        return '\t' + base + '(' + argStr + ')';
      }

      return data.isCommand ? base + ' ' + argStr : base + '(' + argStr + ')';
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

      return clauses.join(' ');
    },
    IfShortcutClause: (
      item: ASTIfClause,
      _data: TransformerDataObject
    ): string => {
      const condition = make(unwrap(item.condition));
      const statement = make(item.body[0]);

      return 'if ' + condition + ' then ' + statement;
    },
    ElseifShortcutClause: (
      item: ASTIfClause,
      _data: TransformerDataObject
    ): string => {
      const condition = make(unwrap(item.condition));
      const statement = make(item.body[0]);

      return 'else if ' + condition + ' then ' + statement;
    },
    ElseShortcutClause: (
      item: ASTElseClause,
      _data: TransformerDataObject
    ): string => {
      const statement = putIndent(make(item.body[0]));
      return 'else ' + statement;
    },
    NilLiteral: (_item: ASTLiteral, _data: TransformerDataObject): string => {
      return 'null';
    },
    ForGenericStatement: (
      item: ASTForGenericStatement,
      _data: TransformerDataObject
    ): string => {
      const variable = make(unwrap(item.variable));
      const iterator = make(unwrap(item.iterator));
      const blockStart = appendComment(
        item.start,
        'for ' + variable + ' in ' + iterator
      );
      const blockEnd = putIndent('end for');

      incIndent();

      const body = buildBlock(item);

      decIndent();

      return blockStart + '\n' + body.join('\n') + '\n' + blockEnd;
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
      const condition = make(unwrap(item.condition));
      const blockStart = appendComment(item.start, 'if ' + condition + ' then');

      incIndent();

      const body = buildBlock(item);

      decIndent();

      return blockStart + '\n' + body.join('\n');
    },
    ElseifClause: (item: ASTIfClause, _data: TransformerDataObject): string => {
      const condition = make(unwrap(item.condition));
      const blockStart = appendComment(
        item.start,
        putIndent('else if') + ' ' + condition + ' then'
      );

      incIndent();

      const body = buildBlock(item);

      decIndent();

      return blockStart + '\n' + body.join('\n');
    },
    ElseClause: (item: ASTElseClause, _data: TransformerDataObject): string => {
      const blockStart = appendComment(item.start, putIndent('else'));

      incIndent();

      const body = buildBlock(item);

      decIndent();

      return blockStart + '\n' + body.join('\n');
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
        return appendComment(item.fields[0].end, '[ ' + field + ' ]');
      }

      const fields = [];
      let fieldItem;

      if (isMultilineAllowed) {
        const blockEnd = putIndent(appendComment(item.end, ']'));

        incIndent();

        for (let index = item.fields.length - 1; index >= 0; index--) {
          const fieldItem = item.fields[index];
          fields.unshift(appendComment(fieldItem.end, make(fieldItem) + ','));
        }

        decIndent();

        const blockStart = appendComment(item.start, '[');

        return (
          blockStart +
          '\n' +
          fields.map((field) => putIndent(field, 1)).join('\n') +
          '\n' +
          blockEnd
        );
      }

      const blockEnd = putIndent(appendComment(item.end, ']'));
      const blockStart = '[';

      for (fieldItem of item.fields) {
        fields.push(make(fieldItem));
      }

      return blockStart + ' ' + fields.join(', ') + ' ' + blockEnd;
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
      data: TransformerDataObject
    ): string => {
      const count = data.isInEvalExpression
        ? 0
        : countEvaluationExpressions(item);

      if (count > 3 || data.isEvalMultiline) {
        if (!data.isEvalMultiline) incIndent();

        const left = make(item.left, {
          isInEvalExpression: true,
          isEvalMultiline: true
        });
        const right = make(item.right, {
          isInEvalExpression: true,
          isEvalMultiline: true
        });
        const operator = item.operator;
        const expression = left + ' ' + operator + '\n' + putIndent(right);

        if (!data.isEvalMultiline) decIndent();

        return expression;
      }

      const left = make(item.left, { isInEvalExpression: true });
      const right = make(item.right, { isInEvalExpression: true });

      return left + ' ' + item.operator + ' ' + right;
    },
    BinaryExpression: (
      item: ASTEvaluationExpression,
      data: TransformerDataObject
    ): string => {
      const count = data.isInBinaryExpression
        ? 0
        : countEvaluationExpressions(item);

      if (count > 3 || data.isEvalMultiline) {
        if (!data.isEvalMultiline) incIndent();

        const left = make(item.left, {
          isInEvalExpression: true,
          isEvalMultiline: true
        });
        const right = make(item.right, {
          isInEvalExpression: true,
          isEvalMultiline: true
        });
        const operator = item.operator;
        const expression = transformBitOperation(
          left + ' ' + operator + '\n' + putIndent(right),
          left,
          right,
          operator
        );

        if (!data.isEvalMultiline) decIndent();

        return expression;
      }

      const left = make(item.left, { isInEvalExpression: true });
      const right = make(item.right, { isInEvalExpression: true });
      const operator = item.operator;
      const expression = transformBitOperation(
        left + ' ' + operator + ' ' + right,
        left,
        right,
        operator
      );

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
      pushLines(item.lines);
      const body = buildBlock(item).join('\n');
      popLines();
      return body;
    }
  };
}
