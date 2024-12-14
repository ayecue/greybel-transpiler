import {
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
  ASTType,
  ASTUnaryExpression,
  ASTWhileStatement
} from 'miniscript-core';
import { basename } from 'path';

import { DependencyLike } from '../types/dependency';
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
  CommentNode,
  commentToText,
  countRightBinaryExpressions,
  SHORTHAND_OPERATORS,
  unwrap
} from './beautify/utils';
import { Factory, Line, LineRef } from './factory';
import { BeautifyBodyIterator, FILLER_TYPE } from './beautify/body-iterator';

export type BeautifyOptions = Partial<BeautifyContextOptions>;

export interface BeautifyLine extends Line {
  comments: CommentNode[];
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
      isDevMode = false
    } = transformer.buildOptions as BeautifyOptions;

    this.context = new BeautifyContext(this, {
      keepParentheses,
      indentation,
      indentationSpaces,
      isDevMode
    });
  }

  createLine(): BeautifyLine {
    return {
      segments: [],
      comments: []
    };
  }

  pushSegment(segment: string, item?: LineRef): void {
    this._activeLine.segments.push(segment);
    if (item == null) return;
    this.pushComment(item.start.line);
  }

  pushComment(lineNr: number): void {
    const chunk = this.context.getCurrentChunk();
    const context = this.context.getChunkContext(chunk);
    const comments = context.commentBuckets.get(lineNr);

    if (comments) {
      this._activeLine.comments.push(...comments);
      context.commentBuckets.delete(lineNr);
    }
  }

  transform(item: ASTChunk, dependency: DependencyLike): string {
    this.reset();

    this._currentDependency = dependency;

    this.process(item);

    return this._lines.map((line) => {
      let output = line.segments.join('');
      const actualContent = output.trim();

      if (line.comments.length === 0) {
        if (actualContent.length === 0) {
          return '';
        }

        return output;
      }

      const before = line.comments.filter((node) => node.isBefore);
      const beforeOutput = before.map(commentToText).join('');
      const after = line.comments.filter((node) => !node.isBefore)
      const afterOutput = after.map(commentToText).join('');

      if (actualContent.length === 0 && before.length === 0 && after.length === 0) {
        return '';
      }

      if (actualContent.length > 0 && before.length > 0) {
        output = ' ' + output;
      }

      if (actualContent.length > 0 && after.length > 0) {
        output = output + ' ';
      }

      return beforeOutput + output + afterOutput;
    }).join('\n');
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
      this.pushSegment('(', item);
      this.process(item.expression, {
        hasLogicalIndentActive: data.hasLogicalIndentActive
      });
      this.pushSegment(')', item);
    },
    Comment: function (
      this: BeautifyFactory,
      item: ASTComment,
      _data: TransformerDataObject
    ): void {
      /*if (item.isMultiline) {
        if (this.transformer.buildOptions.isDevMode) {
          this.tokens.push({
            type: TokenType.Comment,
            value: `${item.value}`,
            ref: item,
            isMultiline: true
          });
          return;
        }

        this.tokens.push({
          type: TokenType.Comment,
          value: item.value
            .split('\n')
            .map((line) => `//${line}`)
            .join('\n'),
          ref: item,
          isMultiline: true
        });

        return;
      }

      this.tokens.push({
        type: TokenType.Comment,
        value: '// ' + item.value.trimStart(),
        ref: item,
        isMultiline: false
      });*/
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
        (variable instanceof ASTIdentifier ||
          variable instanceof ASTMemberExpression) &&
        init instanceof ASTBinaryExpression &&
        (init.left instanceof ASTIdentifier ||
          init.left instanceof ASTMemberExpression) &&
        SHORTHAND_OPERATORS.includes(init.operator) &&
        createExpressionHash(variable) === createExpressionHash(init.left)
      ) {
        this.pushSegment(' ' + init.operator + '= ', item);
        this.process(unwrap(init.right));
        return;
      }

      this.pushSegment(' = ', item);
      this.process(init);
    },
    MemberExpression: function (
      this: BeautifyFactory,
      item: ASTMemberExpression,
      _data: TransformerDataObject
    ): void {
      this.process(item.base);
      this.pushSegment(item.indexer, item);
      this.process(item.identifier);
    },
    FunctionDeclaration: function (
      this: BeautifyFactory,
      item: ASTFunctionStatement,
      _data: TransformerDataObject
    ): void {
      if (item.parameters.length === 0) {
        this.pushSegment('function', {
          start: item.start,
          end: item.start
        });
      } else {
        this.context.disableMultiline();

        this.pushSegment('function(', {
          start: item.start,
          end: item.start
        });

        for (let index = 0; index < item.parameters.length; index++) {
          const arg = item.parameters[index];
          this.process(arg);
          if (index !== item.parameters.length - 1) {
            this.pushSegment(', ', arg);
          }
        }

        this.pushSegment(')', {
          start: item.start,
          end: item.start
        });

        this.context.enableMultiline();
      }

      this.eol();

      this.context.incIndent();
      this.context.buildBlock(item);
      this.context.decIndent();

      this.pushSegment(this.context.getIndent() + 'end function', {
        start: item.end,
        end: item.end
      });
    },
    MapConstructorExpression: function (
      this: BeautifyFactory,
      item: ASTMapConstructorExpression,
      _data: TransformerDataObject
    ): void {
      if (item.fields.length === 0) {
        this.pushSegment('{}', item);
        return;
      }

      if (item.fields.length === 1) {
        this.pushSegment('{ ', item);
        this.process(item.fields[0]);
        this.pushSegment(' }', item);
        return;
      }

      if (this.context.isMultilineAllowed) {
        this.context.incIndent();

        this.pushSegment('{', {
          start: item.start,
          end: item.start
        });
        this.eol();

        const iterator = new BeautifyBodyIterator(item, item.fields);
        let next = iterator.next();

        while (!next.done) {
          const current = next.value as ASTMapKeyString;

          if (current.type === FILLER_TYPE) {
            this.pushSegment(this.context.getIndent());
            this.pushComment(current.start.line);
            this.eol();
            next = iterator.next();
            continue;
          }

          this.pushSegment(this.context.getIndent(), current);
          this.process(current);
          this.pushSegment(',', current);
          this.eol();
          next = iterator.next();
        }

        this.context.decIndent();

        this.pushSegment(this.context.getIndent() + '}', {
          start: item.end,
          end: item.end
        });
        return;
      }

      this.pushSegment('{ ', {
        start: item.start,
        end: item.start
      });

      for (let index = 0; index < item.fields.length; index++) {
        const fieldItem = item.fields[index];
        this.process(fieldItem);
        if (index !== item.fields.length - 1) {
          this.pushSegment(', ', fieldItem);
        }
      }

      this.context.decIndent();

      this.pushSegment(' }', {
        start: item.end,
        end: item.end
      });
    },
    MapKeyString: function (
      this: BeautifyFactory,
      item: ASTMapKeyString,
      _data: TransformerDataObject
    ): void {
      this.process(item.key);
      this.pushSegment(': ', item);
      this.process(item.value);
    },
    Identifier: function (
      this: BeautifyFactory,
      item: ASTIdentifier,
      _data: TransformerDataObject
    ): void {
      this.pushSegment(item.name, item);
    },
    ReturnStatement: function (
      this: BeautifyFactory,
      item: ASTReturnStatement,
      _data: TransformerDataObject
    ): void {
      this.pushSegment('return ', item);
      if (item.argument) this.process(item.argument);
    },
    NumericLiteral: function (
      this: BeautifyFactory,
      item: ASTNumericLiteral,
      _data: TransformerDataObject
    ): void {
      this.pushSegment(getLiteralValue(item), item);
    },
    WhileStatement: function (
      this: BeautifyFactory,
      item: ASTWhileStatement,
      _data: TransformerDataObject
    ): void {
      this.pushSegment('while ', {
        start: item.start,
        end: item.start
      });

      this.context.disableMultiline();
      this.process(item.condition);
      this.context.enableMultiline();

      this.eol();

      this.context.incIndent();
      this.context.buildBlock(item);
      this.context.decIndent();

      this.pushSegment(this.context.getIndent() + 'end while', {
        start: item.end,
        end: item.end
      });
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

      if (item.arguments.length > 3 && this.context.isMultilineAllowed) {
        this.context.incIndent();

        this.pushSegment('(', {
          start: item.start,
          end: item.start
        });
        this.eol();

        for (let index = 0; index < item.arguments.length; index++) {
          const argItem = item.arguments[index];
          this.pushSegment(this.context.getIndent(), argItem);
          this.process(argItem);
          if (index !== item.arguments.length - 1) {
            this.pushSegment(',', argItem);
            this.eol();
          }
        }

        this.context.decIndent();

        this.pushSegment(')', {
          start: item.end,
          end: item.end
        });

        return;
      }

      const startIndex = this.lines.length;

      if (data.isCommand && !this.transformer.buildOptions.keepParentheses) {
        this.pushSegment(' ', {
          start: item.start,
          end: item.start
        });
      } else {
        this.pushSegment('(', {
          start: item.start,
          end: item.start
        });
      }

      for (let index = 0; index < item.arguments.length; index++) {
        const argItem = item.arguments[index];
        this.process(argItem);
        if (index !== item.arguments.length - 1)
          this.pushSegment(', ', argItem);
      }

      const containsNewLine = startIndex !== this.lines.length;

      if (item.arguments.length > 1 && containsNewLine) {
        this._lines = this._lines.slice(0, startIndex);

        this.pushSegment('(', {
          start: item.start,
          end: item.start
        });
        this.eol();

        this.context.incIndent();

        for (let index = 0; index < item.arguments.length; index++) {
          const argItem = item.arguments[index];
          this.pushSegment(this.context.getIndent(), argItem);
          this.process(argItem);
          if (index !== item.arguments.length - 1) {
            this.pushSegment(',', argItem);
            this.eol();
          }
        }

        this.context.decIndent();

        this.pushSegment(')', {
          start: item.end,
          end: item.end
        });

        return;
      }

      if (data.isCommand && !this.transformer.buildOptions.keepParentheses) {
        return;
      }

      this.pushSegment(')', {
        start: item.end,
        end: item.end
      });
    },
    StringLiteral: function (
      this: BeautifyFactory,
      item: ASTLiteral,
      _data: TransformerDataObject
    ): void {
      this.pushSegment(getLiteralRawValue(item), {
        start: item.end,
        end: item.end
      });
    },
    SliceExpression: function (
      this: BeautifyFactory,
      item: ASTSliceExpression,
      _data: TransformerDataObject
    ): void {
      this.process(item.base);
      this.pushSegment('[', item);
      this.process(item.left);
      this.pushSegment(' : ', item);
      this.process(item.right);
      this.pushSegment(']', item);
    },
    IndexExpression: function (
      this: BeautifyFactory,
      item: ASTIndexExpression,
      _data: TransformerDataObject
    ): void {
      this.process(item.base);
      this.pushSegment('[', item);
      this.process(item.index);
      this.pushSegment(']', item);
    },
    UnaryExpression: function (
      this: BeautifyFactory,
      item: ASTUnaryExpression,
      _data: TransformerDataObject
    ): void {
      if (item.operator === 'new') {
        this.pushSegment(item.operator + ' ', item);
      } else {
        this.pushSegment(item.operator, item);
      }

      this.process(item.argument);
    },
    NegationExpression: function (
      this: BeautifyFactory,
      item: ASTUnaryExpression,
      _data: TransformerDataObject
    ): void {
      this.pushSegment('not ', item);
      this.process(item.argument);
    },
    FeatureEnvarExpression: function (
      this: BeautifyFactory,
      item: ASTFeatureEnvarExpression,
      _data: TransformerDataObject
    ): void {
      if (this.transformer.buildOptions.isDevMode) {
        this.pushSegment(`#envar ${item.name}`, item);
        return;
      }

      const value = this.transformer.environmentVariables.get(item.name);

      if (!value) {
        this.pushSegment('null', item);
        return;
      }

      this.pushSegment(`"${value}"`, item);
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
          this.pushSegment(' ', item);
        }
      }
    },
    IfShortcutClause: function (
      this: BeautifyFactory,
      item: ASTIfClause,
      _data: TransformerDataObject
    ): void {
      this.pushSegment('if ', item);
      this.process(unwrap(item.condition));
      this.pushSegment(' then ', item);
      this.process(item.body[0]);
    },
    ElseifShortcutClause: function (
      this: BeautifyFactory,
      item: ASTIfClause,
      _data: TransformerDataObject
    ): void {
      this.pushSegment('else if ', item);
      this.process(unwrap(item.condition));
      this.pushSegment(' then ', item);
      this.process(item.body[0]);
    },
    ElseShortcutClause: function (
      this: BeautifyFactory,
      item: ASTElseClause,
      _data: TransformerDataObject
    ): void {
      this.pushSegment('else ', item);
      this.process(item.body[0]);
    },
    NilLiteral: function (
      this: BeautifyFactory,
      item: ASTLiteral,
      _data: TransformerDataObject
    ): void {
      this.pushSegment(getLiteralRawValue(item), item);
    },
    ForGenericStatement: function (
      this: BeautifyFactory,
      item: ASTForGenericStatement,
      _data: TransformerDataObject
    ): void {
      this.pushSegment('for ', {
        start: item.start,
        end: item.start
      });
      this.process(unwrap(item.variable));
      this.pushSegment(' in ', {
        start: item.start,
        end: item.start
      });
      this.process(unwrap(item.iterator));

      this.eol();

      this.context.incIndent();
      this.context.buildBlock(item);
      this.context.decIndent();

      this.pushSegment(this.context.getIndent() + 'end for', {
        start: item.end,
        end: item.end
      });
    },
    IfStatement: function (
      this: BeautifyFactory,
      item: ASTIfStatement,
      _data: TransformerDataObject
    ): void {
      for (const clausesItem of item.clauses) {
        this.process(clausesItem);
      }

      this.pushSegment(this.context.getIndent() + 'end if', {
        start: item.end,
        end: item.end
      });
    },
    IfClause: function (
      this: BeautifyFactory,
      item: ASTIfClause,
      _data: TransformerDataObject
    ): void {
      this.pushSegment('if ', {
        start: item.start,
        end: item.start
      });
      this.process(unwrap(item.condition));
      this.pushSegment(' then', {
        start: item.start,
        end: item.start
      });
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
      this.pushSegment(this.context.getIndent() + 'else if ', {
        start: item.start,
        end: item.start
      });
      this.process(unwrap(item.condition));
      this.pushSegment(' then', {
        start: item.start,
        end: item.start
      });
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
      this.pushSegment(this.context.getIndent() + 'else', {
        start: item.start,
        end: item.start
      });
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
      this.pushSegment('continue', item);
    },
    BreakStatement: function (
      this: BeautifyFactory,
      item: ASTBase,
      _data: TransformerDataObject
    ): void {
      this.pushSegment('break', item);
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
      if (this.transformer.buildOptions.isDevMode) {
        this.pushSegment(`#inject "${item.path}";`, item);
        return;
      }
      if (this.currentDependency === null) {
        this.pushSegment(`#inject "${item.path}";`, item);
        return;
      }

      const content = this.currentDependency.injections.get(item.path);

      if (content == null) {
        this.pushSegment('null', item);
        return;
      }

      this.pushSegment(`"${content.replace(/"/g, () => '""')}"`, item);
    },
    FeatureImportExpression: function (
      this: BeautifyFactory,
      item: ASTFeatureImportExpression,
      _data: TransformerDataObject
    ): void {
      if (this.transformer.buildOptions.isDevMode) {
        this.pushSegment('#import ', item);
        this.process(item.name);
        this.pushSegment(` from "${item.path}";`, item);
        return;
      }
      if (!item.chunk) {
        this.pushSegment('#import ', item);
        this.process(item.name);
        this.pushSegment(` from "${item.path}";`, item);
        return;
      }

      this.process(item.name);
      this.pushSegment(' = __REQUIRE("' + item.namespace + '")', item);
    },
    FeatureIncludeExpression: function (
      this: BeautifyFactory,
      item: ASTFeatureIncludeExpression,
      _data: TransformerDataObject
    ): void {
      if (this.transformer.buildOptions.isDevMode) {
        this.pushSegment(`#include "${item.path}";`, item);
        return;
      }
      if (!item.chunk) {
        this.pushSegment(`#include "${item.path}";`, item);
        return;
      }

      this.process(item.chunk);
    },
    FeatureDebuggerExpression: function (
      this: BeautifyFactory,
      item: ASTBase,
      _data: TransformerDataObject
    ): void {
      if (this.transformer.buildOptions.isDevMode) {
        this.pushSegment('debugger', item);
        return;
      }
      this.pushSegment('//debugger', item);
    },
    FeatureLineExpression: function (
      this: BeautifyFactory,
      item: ASTBase,
      _data: TransformerDataObject
    ): void {
      if (this.transformer.buildOptions.isDevMode) {
        this.pushSegment('#line', item);
        return;
      }
      this.pushSegment(`${item.start.line}`, item);
    },
    FeatureFileExpression: function (
      this: BeautifyFactory,
      item: ASTFeatureFileExpression,
      _data: TransformerDataObject
    ): void {
      if (this.transformer.buildOptions.isDevMode) {
        this.pushSegment('#filename', item);
        return;
      }
      this.pushSegment(`"${basename(item.filename).replace(/"/g, () => '"')}"`, item);
    },
    ListConstructorExpression: function (
      this: BeautifyFactory,
      item: ASTListConstructorExpression,
      _data: TransformerDataObject
    ): void {
      if (item.fields.length === 0) {
        this.pushSegment('[]', item);
        return;
      }

      if (item.fields.length === 1) {
        this.pushSegment('[ ', item);
        this.process(item.fields[0]);
        this.pushSegment(' ]', item);
        return;
      }

      if (this.context.isMultilineAllowed) {
        this.context.incIndent();

        this.pushSegment('[', {
          start: item.start,
          end: item.start
        });
        this.eol();

        const iterator = new BeautifyBodyIterator(item, item.fields);
        let next = iterator.next();

        while (!next.done) {
          const current = next.value as ASTListValue;

          if (current.type === FILLER_TYPE) {
            this.pushSegment(this.context.getIndent());
            this.pushComment(current.start.line);
            this.eol();
            next = iterator.next();
            continue;
          }

          this.pushSegment(this.context.getIndent(), current);
          this.process(current);
          this.pushSegment(',', current);
          this.eol();
          next = iterator.next();
        }

        this.context.decIndent();

        this.pushSegment(this.context.getIndent() + ']', {
          start: item.end,
          end: item.end
        });

        return;
      }

      this.pushSegment('[ ', item);

      for (let index = 0; index < item.fields.length; index++) {
        const fieldItem = item.fields[index];
        this.process(fieldItem);
        if (index !== item.fields.length - 1) {
          this.pushSegment(', ', fieldItem);
        }
      }

      this.pushSegment(' ]', item);
    },
    ListValue: function (
      this: BeautifyFactory,
      item: ASTListValue,
      _data: TransformerDataObject
    ): void {
      this.process(item.value);
    },
    BooleanLiteral: function (
      this: BeautifyFactory,
      item: ASTBooleanLiteral,
      _data: TransformerDataObject
    ): void {
      this.pushSegment(getLiteralRawValue(item), item);
    },
    EmptyExpression: function (
      this: BeautifyFactory,
      item: ASTBase,
      _data: TransformerDataObject
    ): void {
      this.pushSegment('', item);
    },
    IsaExpression: function (
      this: BeautifyFactory,
      item: ASTIsaExpression,
      data: TransformerDataObject
    ): void {
      this.process(item.left, {
        hasLogicalIndentActive: data.hasLogicalIndentActive
      });
      this.pushSegment(' ' + item.operator + ' ', item);
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

        this.pushSegment(' ' + item.operator + ' ', item);
        this.eol();
        this.pushSegment(this.context.getIndent(), item);

        this.process(item.right, {
          hasLogicalIndentActive: true
        });

        if (!data.hasLogicalIndentActive) this.context.decIndent();

        return;
      }

      this.process(item.left, {
        hasLogicalIndentActive: data.hasLogicalIndentActive
      });

      this.pushSegment(' ' + item.operator + ' ', item);

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
        this.pushSegment('bitOr(', item);
        this.process(item.left);
        this.pushSegment(', ', item);
        this.process(item.right);
        this.pushSegment(')', item);
        return;
      } else if (item.operator === '&') {
        this.pushSegment('bitAnd(', item);
        this.process(item.left);
        this.pushSegment(', ', item);
        this.process(item.right);
        this.pushSegment(')', item);
        return;
      } else if (
        item.operator === '<<' ||
        item.operator === '>>' ||
        item.operator === '>>>'
      ) {
        throw new Error('Operators in binary expression are not supported');
      }

      this.process(item.left);
      this.pushSegment(' ' + item.operator + ' ', item);
      this.process(item.right);
    },
    BinaryNegatedExpression: function (
      this: BeautifyFactory,
      item: ASTUnaryExpression,
      _data: TransformerDataObject
    ): void {
      this.pushSegment(item.operator, item);
      this.process(item.argument);
    },
    ComparisonGroupExpression: function (
      this: BeautifyFactory,
      item: ASTComparisonGroupExpression,
      _data: TransformerDataObject
    ): void {
      this.process(item.expressions[0]);

      for (let index = 0; index < item.operators.length; index++) {
        this.pushSegment(' ' + item.operators[index] + ' ', item);
        this.process(item.expressions[index + 1]);
      }
    },
    Chunk: function (
      this: BeautifyFactory,
      item: ASTChunk,
      _data: TransformerDataObject
    ): void {
      this.context.pushStack(item);
      this.context.buildBlock(item);
      this.context.popStack();
    }
  };

  generateOptimizations(): string[] {
    return [];
  }
}
