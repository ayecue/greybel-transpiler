import {
  ASTChunkAdvancedOptions,
  ASTFeatureEnvarExpression,
  ASTFeatureFileExpression,
  ASTFeatureImportExpression,
  ASTFeatureIncludeExpression,
  ASTFeatureInjectExpression
} from 'greybel-core';
import {
  ASTAssignmentStatement,
  ASTBase,
  ASTBinaryExpression,
  ASTBooleanLiteral,
  ASTCallExpression,
  ASTCallStatement,
  ASTChunk,
  ASTComment,
  ASTComparisonGroupExpression,
  ASTElseClause,
  ASTForGenericStatement,
  ASTFunctionStatement,
  ASTIdentifier,
  ASTIfClause,
  ASTIfStatement,
  ASTIndexExpression,
  ASTIsaExpression,
  ASTListConstructorExpression,
  ASTListValue,
  ASTLiteral,
  ASTLogicalExpression,
  ASTMapConstructorExpression,
  ASTMapKeyString,
  ASTMemberExpression,
  ASTNumericLiteral,
  ASTParenthesisExpression,
  ASTReturnStatement,
  ASTSliceExpression,
  ASTUnaryExpression,
  ASTWhileStatement
} from 'miniscript-core';
import { basename } from 'path';

import { DependencyLike } from '../types/dependency';
import { TransformerDataObject } from '../types/transformer';
import {
  getLiteralRawValue,
  getLiteralValue
} from '../utils/get-literal-value';
import { DefaultFactoryOptions, Factory } from './factory';

export class DefaultFactory extends Factory<DefaultFactoryOptions> {
  transform(item: ASTChunk, dependency: DependencyLike): string {
    this.reset();
    this._currentDependency = dependency;
    this.process(item);

    return this._lines
      .map((line) => {
        return line.segments.join('');
      })
      .join('\n');
  }

  handlers: Record<
    string,
    (this: DefaultFactory, item: ASTBase, data: TransformerDataObject) => void
  > = {
    ParenthesisExpression: function (
      this: DefaultFactory,
      item: ASTParenthesisExpression,
      _data: TransformerDataObject
    ): void {
      this.pushSegment('(');
      this.process(item.expression);
      this.pushSegment(')');
    },
    Comment: function (
      this: DefaultFactory,
      item: ASTComment,
      _data: TransformerDataObject
    ): void {
      if (item.isMultiline) {
        this.pushSegment(
          item.value
            .split('\n')
            .map((line) => `//${line}`)
            .join('\n')
        );
        return;
      }

      this.pushSegment('//' + item.value);
    },
    AssignmentStatement: function (
      this: DefaultFactory,
      item: ASTAssignmentStatement,
      _data: TransformerDataObject
    ): void {
      const variable = item.variable;
      const init = item.init;

      this.process(variable);
      this.pushSegment('=');
      this.process(init);
    },
    MemberExpression: function (
      this: DefaultFactory,
      item: ASTMemberExpression,
      _data: TransformerDataObject
    ): void {
      this.process(item.base);
      this.pushSegment(item.indexer);
      this.process(item.identifier);
    },
    FunctionDeclaration: function (
      this: DefaultFactory,
      item: ASTFunctionStatement,
      _data: TransformerDataObject
    ): void {
      if (item.parameters.length === 0) {
        this.pushSegment('function');
      } else {
        this.pushSegment('function(');

        for (let index = 0; index < item.parameters.length; index++) {
          const arg = item.parameters[index];
          this.process(arg);
          if (index !== item.parameters.length - 1) {
            this.pushSegment(',');
          }
        }

        this.pushSegment(')');
      }

      this.eol();

      for (const bodyItem of item.body) {
        this.process(bodyItem);
        this.eol();
      }

      this.pushSegment('end function');
    },
    MapConstructorExpression: function (
      this: DefaultFactory,
      item: ASTMapConstructorExpression,
      _data: TransformerDataObject
    ): void {
      this.pushSegment('{');

      for (let index = 0; index < item.fields.length; index++) {
        const fieldItem = item.fields[index];
        this.process(fieldItem);
        if (index !== item.fields.length - 1) {
          this.pushSegment(',');
        }
      }

      this.pushSegment('}');
    },
    MapKeyString: function (
      this: DefaultFactory,
      item: ASTMapKeyString,
      _data: TransformerDataObject
    ): void {
      this.process(item.key);
      this.pushSegment(':');
      this.process(item.value);
    },
    Identifier: function (
      this: DefaultFactory,
      item: ASTIdentifier,
      _data: TransformerDataObject
    ): void {
      this.pushSegment(item.name);
    },
    ReturnStatement: function (
      this: DefaultFactory,
      item: ASTReturnStatement,
      _data: TransformerDataObject
    ): void {
      this.pushSegment('return ');
      if (item.argument) this.process(item.argument);
    },
    NumericLiteral: function (
      this: DefaultFactory,
      item: ASTNumericLiteral,
      _data: TransformerDataObject
    ): void {
      this.pushSegment(getLiteralValue(item));
    },
    WhileStatement: function (
      this: DefaultFactory,
      item: ASTWhileStatement,
      _data: TransformerDataObject
    ): void {
      this.pushSegment('while ');
      this.process(item.condition);
      this.eol();

      for (const bodyItem of item.body) {
        this.process(bodyItem);
        this.eol();
      }

      this.pushSegment('end while');
    },
    CallExpression: function (
      this: DefaultFactory,
      item: ASTCallExpression,
      _data: TransformerDataObject
    ): void {
      this.process(item.base);

      if (item.arguments.length === 0) {
        return;
      }

      this.pushSegment('(');

      for (let index = 0; index < item.arguments.length; index++) {
        const argItem = item.arguments[index];
        this.process(argItem);
        if (index !== item.arguments.length - 1) {
          this.pushSegment(',');
        }
      }

      this.pushSegment(')');
    },
    StringLiteral: function (
      this: DefaultFactory,
      item: ASTLiteral,
      _data: TransformerDataObject
    ): void {
      this.pushSegment(getLiteralRawValue(item));
    },
    SliceExpression: function (
      this: DefaultFactory,
      item: ASTSliceExpression,
      _data: TransformerDataObject
    ): void {
      this.process(item.base);
      this.pushSegment('[');
      this.process(item.left);
      this.pushSegment(':');
      this.process(item.right);
      this.pushSegment(']');
    },
    IndexExpression: function (
      this: DefaultFactory,
      item: ASTIndexExpression,
      _data: TransformerDataObject
    ): void {
      this.process(item.base);
      this.pushSegment('[');
      this.process(item.index);
      this.pushSegment(']');
    },
    UnaryExpression: function (
      this: DefaultFactory,
      item: ASTUnaryExpression,
      _data: TransformerDataObject
    ): void {
      if (item.operator === 'new') {
        this.pushSegment(item.operator + ' ');
      } else {
        this.pushSegment(item.operator);
      }

      this.process(item.argument);
    },
    NegationExpression: function (
      this: DefaultFactory,
      item: ASTUnaryExpression,
      _data: TransformerDataObject
    ): void {
      this.pushSegment(item.operator + ' ');
      this.process(item.argument);
    },
    FeatureEnvarExpression: function (
      this: DefaultFactory,
      item: ASTFeatureEnvarExpression,
      _data: TransformerDataObject
    ): void {
      if (this.transformer.buildOptions.isDevMode) {
        this.pushSegment(`#envar ${item.name}`);
        return;
      }

      const value = this.transformer.environmentVariables.get(item.name);

      if (!value) {
        this.pushSegment('null');
        return;
      }

      this.pushSegment(`"${value}"`);
    },
    IfShortcutStatement: function (
      this: DefaultFactory,
      item: ASTIfStatement,
      _data: TransformerDataObject
    ): void {
      for (let index = 0; index < item.clauses.length; index++) {
        const clausesItem = item.clauses[index];
        this.process(clausesItem);
        if (index !== item.clauses.length - 1) {
          this.pushSegment(' ');
        }
      }
    },
    IfShortcutClause: function (
      this: DefaultFactory,
      item: ASTIfClause,
      _data: TransformerDataObject
    ): void {
      this.pushSegment('if ');
      this.process(item.condition);
      this.pushSegment(' then ');
      this.process(item.body[0]);
    },
    ElseifShortcutClause: function (
      this: DefaultFactory,
      item: ASTIfClause,
      _data: TransformerDataObject
    ): void {
      this.pushSegment('else if ');
      this.process(item.condition);
      this.pushSegment(' then ');
      this.process(item.body[0]);
    },
    ElseShortcutClause: function (
      this: DefaultFactory,
      item: ASTElseClause,
      _data: TransformerDataObject
    ): void {
      this.pushSegment('else ');
      this.process(item.body[0]);
    },
    NilLiteral: function (
      this: DefaultFactory,
      item: ASTLiteral,
      _data: TransformerDataObject
    ): void {
      this.pushSegment(getLiteralRawValue(item));
    },
    ForGenericStatement: function (
      this: DefaultFactory,
      item: ASTForGenericStatement,
      _data: TransformerDataObject
    ): void {
      this.pushSegment('for ');
      this.process(item.variable);
      this.pushSegment(' in ');
      this.process(item.iterator);
      this.eol();

      for (const bodyItem of item.body) {
        this.process(bodyItem);
        this.eol();
      }

      this.pushSegment('end for');
    },
    IfStatement: function (
      this: DefaultFactory,
      item: ASTIfStatement,
      _data: TransformerDataObject
    ): void {
      for (const clausesItem of item.clauses) {
        this.process(clausesItem);
      }

      this.pushSegment('end if');
    },
    IfClause: function (
      this: DefaultFactory,
      item: ASTIfClause,
      _data: TransformerDataObject
    ): void {
      this.pushSegment('if ');
      this.process(item.condition);
      this.pushSegment(' then');
      this.eol();

      for (const bodyItem of item.body) {
        this.process(bodyItem);
        this.eol();
      }
    },
    ElseifClause: function (
      this: DefaultFactory,
      item: ASTIfClause,
      _data: TransformerDataObject
    ): void {
      this.pushSegment('else if ');
      this.process(item.condition);
      this.pushSegment(' then');
      this.eol();

      for (const bodyItem of item.body) {
        this.process(bodyItem);
        this.eol();
      }
    },
    ElseClause: function (
      this: DefaultFactory,
      item: ASTElseClause,
      _data: TransformerDataObject
    ): void {
      this.pushSegment('else');
      this.eol();

      for (const bodyItem of item.body) {
        this.process(bodyItem);
        this.eol();
      }
    },
    ContinueStatement: function (
      this: DefaultFactory,
      item: ASTBase,
      _data: TransformerDataObject
    ): void {
      this.pushSegment('continue');
    },
    BreakStatement: function (
      this: DefaultFactory,
      item: ASTBase,
      _data: TransformerDataObject
    ): void {
      this.pushSegment('break');
    },
    CallStatement: function (
      this: DefaultFactory,
      item: ASTCallStatement,
      _data: TransformerDataObject
    ): void {
      this.process(item.expression);
    },
    FeatureInjectExpression: function (
      this: DefaultFactory,
      item: ASTFeatureInjectExpression,
      _data: TransformerDataObject
    ): void {
      if (this.transformer.buildOptions.isDevMode) {
        this.pushSegment(`#inject "${item.path}"`);
        return;
      }
      if (this.currentDependency === null) {
        this.pushSegment(`#inject "${item.path}";`);
        return;
      }

      const content = this.currentDependency.injections.get(item.path);

      if (content == null) {
        this.pushSegment('null');
        return;
      }

      this.pushSegment(`"${content.replace(/"/g, () => '""')}"`);
    },
    FeatureImportExpression: function (
      this: DefaultFactory,
      item: ASTFeatureImportExpression,
      _data: TransformerDataObject
    ): void {
      if (this.transformer.buildOptions.isDevMode) {
        this.pushSegment('#import ');
        this.process(item.name);
        this.pushSegment(` from "${item.path}";`);
        return;
      }
      if (!item.chunk) {
        this.pushSegment('#import ');
        this.process(item.name);
        this.pushSegment(` from "${item.path}";`);
        return;
      }

      this.process(item.name);
      this.pushSegment(' = __REQUIRE("' + item.namespace + '")');
    },
    FeatureIncludeExpression: function (
      this: DefaultFactory,
      item: ASTFeatureIncludeExpression,
      _data: TransformerDataObject
    ): void {
      if (this.transformer.buildOptions.isDevMode) {
        this.pushSegment(`#include "${item.path}";`);
        return;
      }
      if (!item.chunk) {
        this.pushSegment(`#include "${item.path}";`);
        return;
      }

      this.process(item.chunk);
    },
    FeatureDebuggerExpression: function (
      this: DefaultFactory,
      item: ASTBase,
      _data: TransformerDataObject
    ): void {
      if (this.transformer.buildOptions.isDevMode) {
        this.pushSegment('debugger');
        return;
      }
      this.pushSegment('//debugger');
    },
    FeatureLineExpression: function (
      this: DefaultFactory,
      item: ASTBase,
      _data: TransformerDataObject
    ): void {
      if (this.transformer.buildOptions.isDevMode) {
        this.pushSegment('#line');
        return;
      }
      this.pushSegment(`${item.start.line}`);
    },
    FeatureFileExpression: function (
      this: DefaultFactory,
      item: ASTFeatureFileExpression,
      _data: TransformerDataObject
    ): void {
      if (this.transformer.buildOptions.isDevMode) {
        this.pushSegment('#filename');
        return;
      }
      this.pushSegment(`"${basename(item.filename).replace(/"/g, () => '"')}"`);
    },
    ListConstructorExpression: function (
      this: DefaultFactory,
      item: ASTListConstructorExpression,
      _data: TransformerDataObject
    ): void {
      this.pushSegment('[');

      for (let index = 0; index < item.fields.length; index++) {
        const fieldItem = item.fields[index];
        this.process(fieldItem);
        if (index !== item.fields.length - 1) {
          this.pushSegment(',');
        }
      }

      this.pushSegment(']');
    },
    ListValue: function (
      this: DefaultFactory,
      item: ASTListValue,
      _data: TransformerDataObject
    ): void {
      this.process(item.value);
    },
    BooleanLiteral: function (
      this: DefaultFactory,
      item: ASTBooleanLiteral,
      _data: TransformerDataObject
    ): void {
      this.pushSegment(getLiteralRawValue(item));
    },
    EmptyExpression: function (
      this: DefaultFactory,
      item: ASTBase,
      _data: TransformerDataObject
    ): void {
      this.pushSegment('');
    },
    IsaExpression: function (
      this: DefaultFactory,
      item: ASTIsaExpression,
      _data: TransformerDataObject
    ): void {
      this.process(item.left);
      this.pushSegment(' ' + item.operator + ' ');
      this.process(item.right);
    },
    LogicalExpression: function (
      this: DefaultFactory,
      item: ASTLogicalExpression,
      _data: TransformerDataObject
    ): void {
      this.process(item.left);
      this.pushSegment(' ' + item.operator + ' ');
      this.process(item.right);
    },
    BinaryExpression: function (
      this: DefaultFactory,
      item: ASTBinaryExpression,
      _data: TransformerDataObject
    ): void {
      if (item.operator === '|') {
        this.pushSegment('bitOr(');
        this.process(item.left);
        this.pushSegment(',');
        this.process(item.right);
        this.pushSegment(')');
        return;
      } else if (item.operator === '&') {
        this.pushSegment('bitAnd(');
        this.process(item.left);
        this.pushSegment(',');
        this.process(item.right);
        this.pushSegment(')');
        return;
      } else if (
        item.operator === '<<' ||
        item.operator === '>>' ||
        item.operator === '>>>'
      ) {
        throw new Error('Operators in binary expression are not supported');
      }

      this.process(item.left);
      this.pushSegment(item.operator);
      this.process(item.right);
    },
    BinaryNegatedExpression: function (
      this: DefaultFactory,
      item: ASTUnaryExpression,
      _data: TransformerDataObject
    ): void {
      this.pushSegment(item.operator);
      this.process(item.argument);
    },
    ComparisonGroupExpression: function (
      this: DefaultFactory,
      item: ASTComparisonGroupExpression,
      _data: TransformerDataObject
    ): void {
      this.process(item.expressions[0]);

      for (let index = 0; index < item.operators.length; index++) {
        this.pushSegment(item.operators[index]);
        this.process(item.expressions[index + 1]);
      }
    },
    Chunk: function (
      this: DefaultFactory,
      item: ASTChunkAdvancedOptions,
      _data: TransformerDataObject
    ): void {
      for (const bodyItem of item.body) {
        this.process(bodyItem);
        this.eol();
      }
    }
  };

  generateOptimizations(): string[] {
    return [];
  }
}
