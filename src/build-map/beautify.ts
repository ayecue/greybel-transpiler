import {
  ASTChunkGreybel,
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
  ASTType,
  ASTUnaryExpression,
  ASTWhileStatement
} from 'miniscript-core';
import { basename } from 'path';

import { Dependency } from '../dependency';
import { DependencyLike, DependencyType } from '../types/dependency';
import { TransformerDataObject, TransformerLike } from '../types/transformer';
import { createExpressionHash } from '../utils/create-expression-hash';
import {
  getLiteralRawValue,
  getLiteralValue
} from '../utils/get-literal-value';
import {
  BeautifyContext,
  BeautifyContextOptions,
  IndentationType
} from './beautify/context';
import {
  countRightBinaryExpressions,
  SHORTHAND_OPERATORS,
  unwrap
} from './beautify/utils';
import { Factory, Line } from './factory';
import { getOverflowingFunction } from './utils';

export type BeautifyOptions = Partial<BeautifyContextOptions>;

export interface BeautifyLine extends Line {
  trailingComment: string;
}

export class BeautifyFactory extends Factory<BeautifyOptions> {
  readonly context: BeautifyContext;

  declare _lines: BeautifyLine[];
  declare _activeLine: BeautifyLine;

  constructor(transformer: TransformerLike<BeautifyOptions>) {
    super(transformer);

    const {
      keepParentheses = false,
      indentation = IndentationType.Tab,
      indentationSpaces = 2,
      isDevMode = false,
      strictMode = transformer.strictMode
    } = transformer.buildOptions as BeautifyOptions;

    this.context = new BeautifyContext(this, {
      keepParentheses,
      indentation,
      indentationSpaces,
      isDevMode,
      strictMode
    });
  }

  createLine(): BeautifyLine {
    return {
      segments: [],
      trailingComment: ''
    };
  }

  appendTrailingComment(text: string): void {
    if (this._activeLine.trailingComment.length > 0) {
      this._activeLine.trailingComment += ' ' + text;
    } else {
      this._activeLine.trailingComment = text;
    }
  }

  appendTrailingCommentToLine(lineIndex: number, text: string): void {
    const line = this._lines[lineIndex] as BeautifyLine;
    if (!line) return;
    if (line.trailingComment.length > 0) {
      line.trailingComment += ' ' + text;
    } else {
      line.trailingComment = text;
    }
  }

  transform(item: ASTChunkGreybel, dependency: DependencyLike): string {
    this.reset();

    this._originDependency = dependency;
    this._activeDependency = dependency;

    this.process(item);

    const output: string[] = [];

    for (const line of this._lines) {
      const code = line.segments.join('');
      const actualContent = code.trim();
      const hasTrailing = line.trailingComment.length > 0;

      if (!hasTrailing) {
        output.push(actualContent.length === 0 ? '' : code);
        continue;
      }

      // Append trailing comment inline after code
      if (actualContent.length > 0) {
        output.push(code + ' ' + line.trailingComment);
      } else {
        output.push(line.trailingComment);
      }
    }

    return output.join('\n');
  }

  handlers: Record<
    string,
    (this: BeautifyFactory, item: ASTBase, data: TransformerDataObject) => void
  > = {
    ParenthesisExpression: function (
      this: BeautifyFactory,
      item: ASTParenthesisExpression,
      data: TransformerDataObject
    ): void {
      this.pushSegment('(');
      this.process(item.expression, {
        hasLogicalIndentActive: data.hasLogicalIndentActive
      });
      this.pushSegment(')');
    },
    AssignmentStatement: function (
      this: BeautifyFactory,
      item: ASTAssignmentStatement,
      _data: TransformerDataObject
    ): void {
      const variable = item.variable;
      const init = item.init;

      this.process(variable);

      // might can create shorthand for expression
      if (
        !this.context.options.strictMode &&
        (variable instanceof ASTIdentifier ||
          variable instanceof ASTMemberExpression) &&
        init instanceof ASTBinaryExpression &&
        (init.left instanceof ASTIdentifier ||
          init.left instanceof ASTMemberExpression) &&
        SHORTHAND_OPERATORS.includes(init.operator) &&
        createExpressionHash(variable) === createExpressionHash(init.left)
      ) {
        this.pushSegment(' ' + init.operator + '= ');
        this.process(unwrap(init.right));
        return;
      }

      this.pushSegment(' = ');
      this.process(init);
    },
    MemberExpression: function (
      this: BeautifyFactory,
      item: ASTMemberExpression,
      _data: TransformerDataObject
    ): void {
      this.process(item.base);
      this.pushSegment(item.indexer);
      this.process(item.identifier);
    },
    FunctionDeclaration: function (
      this: BeautifyFactory,
      item: ASTFunctionStatement,
      data: TransformerDataObject
    ): void {
      if (item.parameters.length === 0) {
        this.pushSegment('function');
      } else {
        this.context.disableMultiline();

        this.pushSegment('function(');

        for (let index = 0; index < item.parameters.length; index++) {
          const arg = item.parameters[index];
          this.process(arg);
          if (index !== item.parameters.length - 1) {
            this.pushSegment(', ');
          }
        }

        this.pushSegment(')');

        this.context.enableMultiline();
      }

      if (data.headerOnly) return;

      this.eol();

      this.context.incIndent();
      this.context.buildBlock(item);
      this.context.decIndent();

      this.pushSegment(this.context.getIndent() + 'end function');
    },
    MapConstructorExpression: function (
      this: BeautifyFactory,
      item: ASTMapConstructorExpression,
      _data: TransformerDataObject
    ): void {
      if (item.fields.length === 0) {
        this.pushSegment('{}');
        return;
      }

      if (item.fields.length === 1) {
        const overflowFn = getOverflowingFunction(item.fields[0], item.endLine);
        this.pushSegment('{ ');
        this.process(item.fields[0], overflowFn ? { headerOnly: true } : {});
        this.pushSegment(' }');
        this.context.emitTrailingComments(item.fields[0]);

        if (overflowFn) {
          this.eol();
          this.context.incIndent();
          this.context.buildBlock(overflowFn);
          this.context.decIndent();
          this.pushSegment(this.context.getIndent() + 'end function');
          this.context.emitEndTrailingComments(overflowFn);
        }
        return;
      }

      if (this.context.isMultilineAllowed) {
        this.context.incIndent();

        this.pushSegment('{');
        this.eol();

        for (let index = 0; index < item.fields.length; index++) {
          const fieldItem = item.fields[index];

          if (fieldItem.type === ASTType.NoopStatement) {
            // Blank line in map
            if (
              fieldItem.leadingComments &&
              fieldItem.leadingComments.length > 0
            ) {
              this.context.emitLeadingComments(fieldItem);
            } else {
              this.pushSegment(this.context.getIndent());
              this.eol();
            }
            continue;
          }

          this.context.emitLeadingComments(fieldItem);
          this.pushSegment(this.context.getIndent());
          this.process(fieldItem as ASTMapKeyString);
          this.pushSegment(',');
          this.context.emitTrailingComments(fieldItem);
          this.eol();
        }

        this.context.decIndent();

        this.pushSegment(this.context.getIndent() + '}');
        return;
      }

      this.pushSegment('{ ');

      const overflowFns: ASTFunctionStatement[] = [];
      for (let index = 0; index < item.fields.length; index++) {
        const fieldItem = item.fields[index];
        if (fieldItem.type === ASTType.NoopStatement) continue;
        const fn = getOverflowingFunction(fieldItem, item.endLine);
        if (fn) {
          overflowFns.push(fn);
          this.process(fieldItem, { headerOnly: true });
        } else {
          this.process(fieldItem);
        }
        if (index !== item.fields.length - 1) {
          this.pushSegment(', ');
        }
      }

      this.pushSegment(' }');

      if (overflowFns.length > 0) {
        for (const fn of overflowFns) {
          this.eol();
          this.context.incIndent();
          this.context.buildBlock(fn);
          this.context.decIndent();
          this.pushSegment(this.context.getIndent() + 'end function');
          this.context.emitEndTrailingComments(fn);
        }
      }
    },
    MapKeyString: function (
      this: BeautifyFactory,
      item: ASTMapKeyString,
      data: TransformerDataObject
    ): void {
      this.process(item.key);
      this.pushSegment(': ');
      this.process(item.value, data);
    },
    Identifier: function (
      this: BeautifyFactory,
      item: ASTIdentifier,
      _data: TransformerDataObject
    ): void {
      this.pushSegment(item.name);
    },
    ReturnStatement: function (
      this: BeautifyFactory,
      item: ASTReturnStatement,
      _data: TransformerDataObject
    ): void {
      this.pushSegment('return ');
      if (item.argument) this.process(item.argument);
    },
    NumericLiteral: function (
      this: BeautifyFactory,
      item: ASTNumericLiteral,
      _data: TransformerDataObject
    ): void {
      this.pushSegment(getLiteralValue(item));
    },
    WhileStatement: function (
      this: BeautifyFactory,
      item: ASTWhileStatement,
      _data: TransformerDataObject
    ): void {
      this.pushSegment('while ');

      this.context.disableMultiline();
      this.process(item.condition);
      this.context.enableMultiline();

      this.eol();

      this.context.incIndent();
      this.context.buildBlock(item);
      this.context.decIndent();

      this.pushSegment(this.context.getIndent() + 'end while');
    },
    CallExpression: function (
      this: BeautifyFactory,
      item: ASTCallExpression,
      data: TransformerDataObject
    ): void {
      this.process(item.base);

      if (item.arguments.length === 0) {
        return;
      }

      // Detect overflowing anonymous functions in arguments
      const overflowFns: ASTFunctionStatement[] = [];
      for (const arg of item.arguments) {
        const fn = getOverflowingFunction(arg, item.endLine);
        if (fn) overflowFns.push(fn);
      }

      if (
        item.arguments.length > 3 &&
        this.context.isMultilineAllowed &&
        overflowFns.length === 0
      ) {
        this.context.incIndent();

        this.pushSegment('(');
        this.eol();

        for (let index = 0; index < item.arguments.length; index++) {
          const argItem = item.arguments[index];
          this.pushSegment(this.context.getIndent());
          this.process(argItem);
          if (index !== item.arguments.length - 1) {
            this.pushSegment(',');
            this.eol();
          }
        }

        this.context.decIndent();

        this.pushSegment(')');

        return;
      }

      if (data.isCommand && !this.context.options.keepParentheses) {
        this.pushSegment(' ');
      } else {
        this.pushSegment('(');
      }

      for (let index = 0; index < item.arguments.length; index++) {
        const argItem = item.arguments[index];
        const isOverflow =
          getOverflowingFunction(argItem, item.endLine) !== null;
        this.process(argItem, isOverflow ? { headerOnly: true } : {});
        if (index !== item.arguments.length - 1) this.pushSegment(', ');
      }

      if (!(data.isCommand && !this.context.options.keepParentheses)) {
        this.pushSegment(')');
      }

      if (overflowFns.length > 0) {
        overflowFns.sort((a, b) => a.endLine - b.endLine);
        for (const fn of overflowFns) {
          this.eol();
          this.context.incIndent();
          this.context.buildBlock(fn);
          this.context.decIndent();
          this.pushSegment(this.context.getIndent() + 'end function');
          this.context.emitEndTrailingComments(fn);
        }
      }
    },
    StringLiteral: function (
      this: BeautifyFactory,
      item: ASTLiteral,
      _data: TransformerDataObject
    ): void {
      this.pushSegment(getLiteralRawValue(item));
    },
    SliceExpression: function (
      this: BeautifyFactory,
      item: ASTSliceExpression,
      _data: TransformerDataObject
    ): void {
      this.process(item.base);
      this.pushSegment('[');
      this.process(item.left);
      this.pushSegment(' : ');
      this.process(item.right);
      this.pushSegment(']');
    },
    IndexExpression: function (
      this: BeautifyFactory,
      item: ASTIndexExpression,
      _data: TransformerDataObject
    ): void {
      this.process(item.base);
      this.pushSegment('[');
      this.process(item.index);
      this.pushSegment(']');
    },
    UnaryExpression: function (
      this: BeautifyFactory,
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
      this: BeautifyFactory,
      item: ASTUnaryExpression,
      _data: TransformerDataObject
    ): void {
      this.pushSegment('not ');
      this.process(item.argument);
    },
    FeatureEnvarExpression: function (
      this: BeautifyFactory,
      item: ASTFeatureEnvarExpression,
      _data: TransformerDataObject
    ): void {
      if (this.context.options.isDevMode) {
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
      this: BeautifyFactory,
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
      this: BeautifyFactory,
      item: ASTIfClause,
      _data: TransformerDataObject
    ): void {
      this.pushSegment('if ');
      this.process(unwrap(item.condition));
      this.pushSegment(' then ');
      this.process(item.body[0]);
    },
    ElseifShortcutClause: function (
      this: BeautifyFactory,
      item: ASTIfClause,
      _data: TransformerDataObject
    ): void {
      this.pushSegment('else if ');
      this.process(unwrap(item.condition));
      this.pushSegment(' then ');
      this.process(item.body[0]);
    },
    ElseShortcutClause: function (
      this: BeautifyFactory,
      item: ASTElseClause,
      _data: TransformerDataObject
    ): void {
      this.pushSegment('else ');
      this.process(item.body[0]);
    },
    NilLiteral: function (
      this: BeautifyFactory,
      item: ASTLiteral,
      _data: TransformerDataObject
    ): void {
      this.pushSegment(getLiteralRawValue(item));
    },
    ForGenericStatement: function (
      this: BeautifyFactory,
      item: ASTForGenericStatement,
      _data: TransformerDataObject
    ): void {
      this.pushSegment('for ');
      this.process(unwrap(item.variable));
      this.pushSegment(' in ');
      this.process(unwrap(item.iterator));

      this.eol();

      this.context.incIndent();
      this.context.buildBlock(item);
      this.context.decIndent();

      this.pushSegment(this.context.getIndent() + 'end for');
    },
    IfStatement: function (
      this: BeautifyFactory,
      item: ASTIfStatement,
      _data: TransformerDataObject
    ): void {
      for (const clausesItem of item.clauses) {
        this.process(clausesItem);
      }

      this.pushSegment(this.context.getIndent() + 'end if');
    },
    IfClause: function (
      this: BeautifyFactory,
      item: ASTIfClause,
      _data: TransformerDataObject
    ): void {
      this.pushSegment('if ');
      this.process(unwrap(item.condition));
      this.pushSegment(' then');
      this.context.emitTrailingComments(item);
      this.eol();

      this.context.incIndent();
      this.context.buildBlock(item);
      this.context.decIndent();
    },
    ElseifClause: function (
      this: BeautifyFactory,
      item: ASTIfClause,
      _data: TransformerDataObject
    ): void {
      this.pushSegment(this.context.getIndent() + 'else if ');
      this.process(unwrap(item.condition));
      this.pushSegment(' then');
      this.context.emitTrailingComments(item);
      this.eol();

      this.context.incIndent();
      this.context.buildBlock(item);
      this.context.decIndent();
    },
    ElseClause: function (
      this: BeautifyFactory,
      item: ASTElseClause,
      _data: TransformerDataObject
    ): void {
      this.pushSegment(this.context.getIndent() + 'else');
      this.context.emitTrailingComments(item);
      this.eol();

      this.context.incIndent();
      this.context.buildBlock(item);
      this.context.decIndent();
    },
    ContinueStatement: function (
      this: BeautifyFactory,
      item: ASTBase,
      _data: TransformerDataObject
    ): void {
      this.pushSegment('continue');
    },
    BreakStatement: function (
      this: BeautifyFactory,
      item: ASTBase,
      _data: TransformerDataObject
    ): void {
      this.pushSegment('break');
    },
    CallStatement: function (
      this: BeautifyFactory,
      item: ASTCallStatement,
      _data: TransformerDataObject
    ): void {
      this.process(item.expression, { isCommand: true });
    },
    FeatureInjectExpression: function (
      this: BeautifyFactory,
      item: ASTFeatureInjectExpression,
      _data: TransformerDataObject
    ): void {
      if (this.context.options.isDevMode) {
        this.pushSegment(`#inject "${item.path}";`);
        return;
      }
      if (this.activeDependency === null) {
        this.pushSegment(`#inject "${item.path}";`);
        return;
      }

      const content = this.activeDependency.injections.get(item.path);

      if (content == null) {
        this.pushSegment('null');
        return;
      }

      this.pushSegment(`"${content.replace(/"/g, () => '""')}"`);
    },
    FeatureImportExpression: function (
      this: BeautifyFactory,
      item: ASTFeatureImportExpression,
      _data: TransformerDataObject
    ): void {
      if (this.context.options.isDevMode) {
        this.pushSegment('#import ');
        this.process(item.name);
        this.pushSegment(` from "${item.path}";`);
        return;
      }
      const associatedDependency = this.activeDependency?.dependencies.get(
        Dependency.generateDependencyMappingKey(
          item.path,
          DependencyType.Import
        )
      );
      if (!associatedDependency) {
        this.pushSegment('#import ');
        this.process(item.name);
        this.pushSegment(` from "${item.path}";`);
        return;
      }

      this.process(item.name);
      this.pushSegment(
        ' = __REQUIRE("' + associatedDependency.getNamespace() + '")'
      );
    },
    FeatureIncludeExpression: function (
      this: BeautifyFactory,
      item: ASTFeatureIncludeExpression,
      _data: TransformerDataObject
    ): void {
      if (this.context.options.isDevMode) {
        if (item.typeOnly) {
          this.pushSegment(`#include type "${item.path}";`);
          return;
        }
        this.pushSegment(`#include "${item.path}";`);
        return;
      }
      if (item.typeOnly) return;
      const associatedDependency = this.activeDependency?.dependencies.get(
        Dependency.generateDependencyMappingKey(
          item.path,
          DependencyType.Include
        )
      );
      if (!associatedDependency) {
        this.pushSegment(`#include "${item.path}";`);
        return;
      }

      const currentDependency = this.activeDependency;
      this.activeDependency = associatedDependency;
      this.process(associatedDependency.chunk);
      this.activeDependency = currentDependency;
    },
    FeatureDebuggerExpression: function (
      this: BeautifyFactory,
      item: ASTBase,
      _data: TransformerDataObject
    ): void {
      if (this.context.options.isDevMode) {
        this.pushSegment('debugger');
        return;
      }
      this.pushSegment('//debugger');
    },
    FeatureLineExpression: function (
      this: BeautifyFactory,
      item: ASTBase,
      _data: TransformerDataObject
    ): void {
      if (this.context.options.isDevMode) {
        this.pushSegment('#line');
        return;
      }
      this.pushSegment(`${item.startLine}`);
    },
    FeatureFileExpression: function (
      this: BeautifyFactory,
      item: ASTFeatureFileExpression,
      _data: TransformerDataObject
    ): void {
      if (this.context.options.isDevMode) {
        this.pushSegment('#filename');
        return;
      }
      this.pushSegment(`"${basename(item.filename).replace(/"/g, () => '"')}"`);
    },
    ListConstructorExpression: function (
      this: BeautifyFactory,
      item: ASTListConstructorExpression,
      _data: TransformerDataObject
    ): void {
      if (item.fields.length === 0) {
        this.pushSegment('[]');
        return;
      }

      if (item.fields.length === 1) {
        const overflowFn = getOverflowingFunction(item.fields[0], item.endLine);
        this.pushSegment('[ ');
        this.process(item.fields[0], overflowFn ? { headerOnly: true } : {});
        this.pushSegment(' ]');
        this.context.emitTrailingComments(item.fields[0]);

        if (overflowFn) {
          this.eol();
          this.context.incIndent();
          this.context.buildBlock(overflowFn);
          this.context.decIndent();
          this.pushSegment(this.context.getIndent() + 'end function');
          this.context.emitEndTrailingComments(overflowFn);
        }
        return;
      }

      if (this.context.isMultilineAllowed) {
        this.context.incIndent();

        this.pushSegment('[');
        this.eol();

        for (let index = 0; index < item.fields.length; index++) {
          const fieldItem = item.fields[index];

          if (fieldItem.type === ASTType.NoopStatement) {
            if (
              fieldItem.leadingComments &&
              fieldItem.leadingComments.length > 0
            ) {
              this.context.emitLeadingComments(fieldItem);
            } else {
              this.pushSegment(this.context.getIndent());
              this.eol();
            }
            continue;
          }

          this.context.emitLeadingComments(fieldItem);
          this.pushSegment(this.context.getIndent());
          this.process(fieldItem as ASTListValue);
          this.pushSegment(',');
          this.context.emitTrailingComments(fieldItem);
          this.eol();
        }

        this.context.decIndent();

        this.pushSegment(this.context.getIndent() + ']');

        return;
      }

      this.pushSegment('[ ');

      const overflowFns: ASTFunctionStatement[] = [];
      for (let index = 0; index < item.fields.length; index++) {
        const fieldItem = item.fields[index];
        if (fieldItem.type === ASTType.NoopStatement) continue;
        const fn = getOverflowingFunction(fieldItem, item.endLine);
        if (fn) {
          overflowFns.push(fn);
          this.process(fieldItem, { headerOnly: true });
        } else {
          this.process(fieldItem);
        }
        if (index !== item.fields.length - 1) {
          this.pushSegment(', ');
        }
      }

      this.pushSegment(' ]');

      if (overflowFns.length > 0) {
        overflowFns.sort((a, b) => a.endLine - b.endLine);
        for (const fn of overflowFns) {
          this.eol();
          this.context.incIndent();
          this.context.buildBlock(fn);
          this.context.decIndent();
          this.pushSegment(this.context.getIndent() + 'end function');
          this.context.emitEndTrailingComments(fn);
        }
      }
    },
    ListValue: function (
      this: BeautifyFactory,
      item: ASTListValue,
      data: TransformerDataObject
    ): void {
      this.process(item.value, data);
    },
    BooleanLiteral: function (
      this: BeautifyFactory,
      item: ASTBooleanLiteral,
      _data: TransformerDataObject
    ): void {
      this.pushSegment(getLiteralRawValue(item));
    },
    EmptyExpression: function (
      this: BeautifyFactory,
      item: ASTBase,
      _data: TransformerDataObject
    ): void {
      this.pushSegment('');
    },
    IsaExpression: function (
      this: BeautifyFactory,
      item: ASTIsaExpression,
      data: TransformerDataObject
    ): void {
      this.process(item.left, {
        hasLogicalIndentActive: data.hasLogicalIndentActive
      });
      this.pushSegment(' ' + item.operator + ' ');
      this.process(item.right, {
        hasLogicalIndentActive: data.hasLogicalIndentActive
      });
    },
    LogicalExpression: function (
      this: BeautifyFactory,
      item: ASTLogicalExpression,
      data: TransformerDataObject
    ): void {
      const count = countRightBinaryExpressions(item.right);

      if (count > 2) {
        if (!data.hasLogicalIndentActive) this.context.incIndent();

        this.process(item.left, {
          hasLogicalIndentActive: true
        });

        this.pushSegment(' ' + item.operator + ' ');
        this.eol();
        this.pushSegment(this.context.getIndent());

        this.process(item.right, {
          hasLogicalIndentActive: true
        });

        if (!data.hasLogicalIndentActive) this.context.decIndent();

        return;
      }

      this.process(item.left, {
        hasLogicalIndentActive: data.hasLogicalIndentActive
      });

      this.pushSegment(' ' + item.operator + ' ');

      this.process(item.right, {
        hasLogicalIndentActive: data.hasLogicalIndentActive
      });
    },
    BinaryExpression: function (
      this: BeautifyFactory,
      item: ASTBinaryExpression,
      _data: TransformerDataObject
    ): void {
      if (item.operator === '|') {
        this.pushSegment('bitOr(');
        this.process(item.left);
        this.pushSegment(', ');
        this.process(item.right);
        this.pushSegment(')');
        return;
      } else if (item.operator === '&') {
        this.pushSegment('bitAnd(');
        this.process(item.left);
        this.pushSegment(', ');
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
      this.pushSegment(' ' + item.operator + ' ');
      this.process(item.right);
    },
    BinaryNegatedExpression: function (
      this: BeautifyFactory,
      item: ASTUnaryExpression,
      _data: TransformerDataObject
    ): void {
      this.pushSegment(item.operator);
      this.process(item.argument);
    },
    ComparisonGroupExpression: function (
      this: BeautifyFactory,
      item: ASTComparisonGroupExpression,
      _data: TransformerDataObject
    ): void {
      this.process(item.expressions[0]);

      for (let index = 0; index < item.operators.length; index++) {
        this.pushSegment(' ' + item.operators[index] + ' ');
        this.process(item.expressions[index + 1]);
      }
    },
    Chunk: function (
      this: BeautifyFactory,
      item: ASTChunkGreybel,
      _data: TransformerDataObject
    ): void {
      this.context.buildBlock(item);
    }
  };

  generateOptimizations(): string[] {
    return [];
  }
}
