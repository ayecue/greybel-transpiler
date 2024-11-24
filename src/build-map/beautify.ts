import {
  ASTFeatureEnvarExpression,
  ASTFeatureFileExpression,
  ASTFeatureImportExpression,
  ASTFeatureIncludeExpression,
  ASTFeatureInjectExpression
} from 'greybel-core';
import { get } from 'http';
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
import { Factory, TokenType } from './factory';

export type BeautifyOptions = Partial<BeautifyContextOptions>;

export class BeautifyFactory extends Factory<BeautifyOptions> {
  readonly context: BeautifyContext;

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

  transform(item: ASTChunk, dependency: DependencyLike): string {
    this._tokens = [];

    this._currentDependency = dependency;
    this.process(item);

    let output = '';

    for (let index = 0; index < this.tokens.length - 1; index++) {
      const token = this.tokens[index];
      const nextToken = this.tokens[index + 1];

      if (token.type === TokenType.Text) {
        output += token.value;
      } else if (token.type === TokenType.Comment) {
        output += token.value;
      } else if (token.type === TokenType.EndOfLine) {
        if (
          nextToken?.type === TokenType.Comment &&
          token.ref.end.line === nextToken?.ref.start.line
        ) {
          output += ' ' + nextToken.value.trim();
          index++;
          continue;
        }

        output += '\n';
      } else {
        throw new Error('Unknown token type!');
      }
    }

    return output;
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
      this.tokens.push({
        type: TokenType.Text,
        value: '(',
        ref: item
      });
      this.process(item.expression, {
        hasLogicalIndentActive: data.hasLogicalIndentActive
      });
      this.tokens.push({
        type: TokenType.Text,
        value: ')',
        ref: item
      });
    },
    Comment: function (
      this: BeautifyFactory,
      item: ASTComment,
      _data: TransformerDataObject
    ): void {
      this.context.usedComments.add(item);

      if (item.isMultiline) {
        if (this.transformer.buildOptions.isDevMode) {
          this.tokens.push({
            type: TokenType.Comment,
            value: `/*${item.value}*/`,
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
      });
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
        this.tokens.push({
          type: TokenType.Text,
          value: ' ' + init.operator + '= ',
          ref: item
        });
        this.process(unwrap(init.right));
        return;
      }

      this.tokens.push({
        type: TokenType.Text,
        value: ' = ',
        ref: item
      });

      this.process(init);
    },
    MemberExpression: function (
      this: BeautifyFactory,
      item: ASTMemberExpression,
      _data: TransformerDataObject
    ): void {
      this.process(item.base);
      this.tokens.push({
        type: TokenType.Text,
        value: item.indexer,
        ref: item
      });
      this.process(item.identifier);
    },
    FunctionDeclaration: function (
      this: BeautifyFactory,
      item: ASTFunctionStatement,
      _data: TransformerDataObject
    ): void {
      if (item.parameters.length === 0) {
        this.tokens.push({
          type: TokenType.Text,
          value: 'function',
          ref: {
            start: item.start,
            end: item.start
          }
        });
      } else {
        this.context.disableMultiline();

        this.tokens.push({
          type: TokenType.Text,
          value: 'function(',
          ref: {
            start: item.start,
            end: item.start
          }
        });

        for (let index = 0; index < item.parameters.length; index++) {
          const arg = item.parameters[index];
          this.process(arg);
          if (index !== item.parameters.length - 1)
            this.tokens.push({
              type: TokenType.Text,
              value: ', ',
              ref: arg
            });
        }

        this.tokens.push({
          type: TokenType.Text,
          value: ')',
          ref: {
            start: item.start,
            end: item.start
          }
        });

        this.context.enableMultiline();
      }

      this.tokens.push({
        type: TokenType.EndOfLine,
        value: '\n',
        ref: {
          start: item.start,
          end: item.start
        }
      });

      this.context.incIndent();
      this.context.buildBlock(item);
      this.context.decIndent();

      this.tokens.push({
        type: TokenType.Text,
        value: this.context.getIndent() + 'end function',
        ref: {
          start: item.end,
          end: item.end
        }
      });
    },
    MapConstructorExpression: function (
      this: BeautifyFactory,
      item: ASTMapConstructorExpression,
      _data: TransformerDataObject
    ): void {
      if (item.fields.length === 0) {
        this.tokens.push({
          type: TokenType.Text,
          value: '{}',
          ref: item
        });
        return;
      }

      if (item.fields.length === 1) {
        this.tokens.push({
          type: TokenType.Text,
          value: '{ ',
          ref: item
        });
        this.process(item.fields[0]);
        this.tokens.push({
          type: TokenType.Text,
          value: ' }',
          ref: item
        });
        return;
      }

      if (this.context.isMultilineAllowed) {
        this.context.incIndent();

        this.tokens.push({
          type: TokenType.Text,
          value: '{',
          ref: {
            start: item.start,
            end: item.start
          }
        });
        this.tokens.push({
          type: TokenType.EndOfLine,
          value: '\n',
          ref: {
            start: item.start,
            end: item.start
          }
        });

        for (let index = 0; index < item.fields.length; index++) {
          const fieldItem = item.fields[index];
          this.tokens.push({
            type: TokenType.Text,
            value: this.context.getIndent(),
            ref: fieldItem
          });
          this.process(fieldItem);
          this.tokens.push({
            type: TokenType.Text,
            value: ',',
            ref: fieldItem
          });
          this.tokens.push({
            type: TokenType.EndOfLine,
            value: '\n',
            ref: fieldItem
          });
        }

        this.context.decIndent();

        this.tokens.push({
          type: TokenType.Text,
          value: this.context.getIndent() + '}',
          ref: {
            start: item.end,
            end: item.end
          }
        });
        return;
      }

      this.tokens.push({
        type: TokenType.Text,
        value: '{ ',
        ref: {
          start: item.start,
          end: item.start
        }
      });

      for (let index = 0; index < item.fields.length; index++) {
        const fieldItem = item.fields[index];
        this.process(fieldItem);
        if (index !== item.fields.length - 1)
          this.tokens.push({
            type: TokenType.Text,
            value: ', ',
            ref: fieldItem
          });
      }

      this.context.decIndent();

      this.tokens.push({
        type: TokenType.Text,
        value: ' }',
        ref: {
          start: item.end,
          end: item.end
        }
      });
    },
    MapKeyString: function (
      this: BeautifyFactory,
      item: ASTMapKeyString,
      _data: TransformerDataObject
    ): void {
      this.process(item.key);
      this.tokens.push({
        type: TokenType.Text,
        value: ': ',
        ref: item
      });
      this.process(item.value);
    },
    Identifier: function (
      this: BeautifyFactory,
      item: ASTIdentifier,
      _data: TransformerDataObject
    ): void {
      this.tokens.push({
        type: TokenType.Text,
        value: item.name,
        ref: item
      });
    },
    ReturnStatement: function (
      this: BeautifyFactory,
      item: ASTReturnStatement,
      _data: TransformerDataObject
    ): void {
      this.tokens.push({
        type: TokenType.Text,
        value: 'return ',
        ref: item
      });
      if (item.argument) this.process(item.argument);
    },
    NumericLiteral: function (
      this: BeautifyFactory,
      item: ASTNumericLiteral,
      _data: TransformerDataObject
    ): void {
      this.tokens.push({
        type: TokenType.Text,
        value: getLiteralValue(item),
        ref: item
      });
    },
    WhileStatement: function (
      this: BeautifyFactory,
      item: ASTWhileStatement,
      _data: TransformerDataObject
    ): void {
      this.tokens.push({
        type: TokenType.Text,
        value: 'while ',
        ref: {
          start: item.start,
          end: item.start
        }
      });

      this.context.disableMultiline();
      this.process(item.condition);
      this.context.enableMultiline();

      this.tokens.push({
        type: TokenType.EndOfLine,
        value: '\n',
        ref: {
          start: item.start,
          end: item.start
        }
      });

      this.context.incIndent();
      this.context.buildBlock(item);
      this.context.decIndent();

      this.tokens.push({
        type: TokenType.Text,
        value: this.context.getIndent() + 'end while',
        ref: {
          start: item.end,
          end: item.end
        }
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

        this.tokens.push({
          type: TokenType.Text,
          value: '(',
          ref: {
            start: item.start,
            end: item.start
          }
        });

        this.tokens.push({
          type: TokenType.EndOfLine,
          value: '\n',
          ref: {
            start: item.start,
            end: item.start
          }
        });

        for (let index = 0; index < item.arguments.length; index++) {
          const argItem = item.arguments[index];
          this.tokens.push({
            type: TokenType.Text,
            value: this.context.getIndent(),
            ref: argItem
          });
          this.process(argItem);
          if (index !== item.arguments.length - 1) {
            this.tokens.push({
              type: TokenType.Text,
              value: ',',
              ref: argItem
            });
            this.tokens.push({
              type: TokenType.EndOfLine,
              value: '\n',
              ref: argItem
            });
          }
        }

        this.context.decIndent();

        this.tokens.push({
          type: TokenType.Text,
          value: ')',
          ref: {
            start: item.end,
            end: item.end
          }
        });

        return;
      }

      this.tokens.push({
        type: TokenType.Text,
        value: '(',
        ref: {
          start: item.start,
          end: item.start
        }
      });

      const startIndex = this.tokens.length - 1;

      for (let index = 0; index < item.arguments.length; index++) {
        const argItem = item.arguments[index];
        this.process(argItem);
        if (index !== item.arguments.length - 1)
          this.tokens.push({
            type: TokenType.Text,
            value: ', ',
            ref: argItem
          });
      }

      const containsNewLine = this.context.containsNewLineInRange(startIndex);

      if (item.arguments.length > 1 && containsNewLine) {
        this._tokens = this._tokens.slice(0, startIndex + 1);

        this.context.incIndent();

        this.tokens.push({
          type: TokenType.EndOfLine,
          value: '\n',
          ref: {
            start: item.start,
            end: item.start
          }
        });

        for (let index = 0; index < item.arguments.length; index++) {
          const argItem = item.arguments[index];
          this.tokens.push({
            type: TokenType.Text,
            value: this.context.getIndent(),
            ref: argItem
          });
          this.process(argItem);
          if (index !== item.arguments.length - 1) {
            this.tokens.push({
              type: TokenType.Text,
              value: ',',
              ref: argItem
            });
            this.tokens.push({
              type: TokenType.EndOfLine,
              value: '\n',
              ref: argItem
            });
          }
        }

        this.context.decIndent();

        this.tokens.push({
          type: TokenType.Text,
          value: ')',
          ref: {
            start: item.end,
            end: item.end
          }
        });

        return;
      }

      if (data.isCommand && !this.transformer.buildOptions.keepParentheses) {
        this.tokens[startIndex].value = ' ';
        return;
      }

      this.tokens.push({
        type: TokenType.Text,
        value: ')',
        ref: {
          start: item.end,
          end: item.end
        }
      });
    },
    StringLiteral: function (
      this: BeautifyFactory,
      item: ASTLiteral,
      _data: TransformerDataObject
    ): void {
      this.tokens.push({
        type: TokenType.Text,
        value: getLiteralRawValue(item),
        ref: {
          start: item.end,
          end: item.end
        }
      });
    },
    SliceExpression: function (
      this: BeautifyFactory,
      item: ASTSliceExpression,
      _data: TransformerDataObject
    ): void {
      this.process(item.base);
      this.tokens.push({
        type: TokenType.Text,
        value: '[',
        ref: item
      });
      this.process(item.left);
      this.tokens.push({
        type: TokenType.Text,
        value: ' : ',
        ref: item
      });
      this.process(item.right);
      this.tokens.push({
        type: TokenType.Text,
        value: ']',
        ref: item
      });
    },
    IndexExpression: function (
      this: BeautifyFactory,
      item: ASTIndexExpression,
      _data: TransformerDataObject
    ): void {
      this.process(item.base);
      this.tokens.push({
        type: TokenType.Text,
        value: '[',
        ref: item
      });
      this.process(item.index);
      this.tokens.push({
        type: TokenType.Text,
        value: ']',
        ref: item
      });
    },
    UnaryExpression: function (
      this: BeautifyFactory,
      item: ASTUnaryExpression,
      _data: TransformerDataObject
    ): void {
      if (item.operator === 'new') {
        this.tokens.push({
          type: TokenType.Text,
          value: item.operator + ' ',
          ref: item
        });
      } else {
        this.tokens.push({
          type: TokenType.Text,
          value: item.operator,
          ref: item
        });
      }

      this.process(item.argument);
    },
    NegationExpression: function (
      this: BeautifyFactory,
      item: ASTUnaryExpression,
      _data: TransformerDataObject
    ): void {
      this.tokens.push({
        type: TokenType.Text,
        value: 'not ',
        ref: item
      });

      this.process(item.argument);
    },
    FeatureEnvarExpression: function (
      this: BeautifyFactory,
      item: ASTFeatureEnvarExpression,
      _data: TransformerDataObject
    ): void {
      if (this.transformer.buildOptions.isDevMode) {
        this.tokens.push({
          type: TokenType.Text,
          value: `#envar ${item.name}`,
          ref: item
        });
        return;
      }

      const value = this.transformer.environmentVariables.get(item.name);

      if (!value) {
        this.tokens.push({
          type: TokenType.Text,
          value: 'null',
          ref: item
        });
        return;
      }

      this.tokens.push({
        type: TokenType.Text,
        value: `"${value}"`,
        ref: item
      });
    },
    IfShortcutStatement: function (
      this: BeautifyFactory,
      item: ASTIfStatement,
      _data: TransformerDataObject
    ): void {
      for (let index = 0; index < item.clauses.length; index++) {
        const clausesItem = item.clauses[index];
        this.process(clausesItem);
        if (index !== item.clauses.length - 1)
          this.tokens.push({
            type: TokenType.Text,
            value: ' ',
            ref: item
          });
      }
    },
    IfShortcutClause: function (
      this: BeautifyFactory,
      item: ASTIfClause,
      _data: TransformerDataObject
    ): void {
      this.tokens.push({
        type: TokenType.Text,
        value: 'if ',
        ref: item
      });
      this.process(unwrap(item.condition));
      this.tokens.push({
        type: TokenType.Text,
        value: ' then ',
        ref: item
      });
      this.process(item.body[0]);
    },
    ElseifShortcutClause: function (
      this: BeautifyFactory,
      item: ASTIfClause,
      _data: TransformerDataObject
    ): void {
      this.tokens.push({
        type: TokenType.Text,
        value: 'else if ',
        ref: item
      });
      this.process(unwrap(item.condition));
      this.tokens.push({
        type: TokenType.Text,
        value: ' then ',
        ref: item
      });
      this.process(item.body[0]);
    },
    ElseShortcutClause: function (
      this: BeautifyFactory,
      item: ASTElseClause,
      _data: TransformerDataObject
    ): void {
      this.tokens.push({
        type: TokenType.Text,
        value: 'else ',
        ref: item
      });
      this.process(item.body[0]);
    },
    NilLiteral: function (
      this: BeautifyFactory,
      item: ASTLiteral,
      _data: TransformerDataObject
    ): void {
      this.tokens.push({
        type: TokenType.Text,
        value: getLiteralRawValue(item),
        ref: item
      });
    },
    ForGenericStatement: function (
      this: BeautifyFactory,
      item: ASTForGenericStatement,
      _data: TransformerDataObject
    ): void {
      this.tokens.push({
        type: TokenType.Text,
        value: 'for ',
        ref: {
          start: item.start,
          end: item.start
        }
      });
      this.process(unwrap(item.variable));
      this.tokens.push({
        type: TokenType.Text,
        value: ' in ',
        ref: {
          start: item.start,
          end: item.start
        }
      });
      this.process(unwrap(item.iterator));

      this.tokens.push({
        type: TokenType.EndOfLine,
        value: '\n',
        ref: {
          start: item.start,
          end: item.start
        }
      });

      this.context.incIndent();
      this.context.buildBlock(item);
      this.context.decIndent();

      this.tokens.push({
        type: TokenType.Text,
        value: this.context.getIndent() + 'end for',
        ref: {
          start: item.end,
          end: item.end
        }
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

      this.tokens.push({
        type: TokenType.Text,
        value: this.context.getIndent() + 'end if',
        ref: {
          start: item.end,
          end: item.end
        }
      });
    },
    IfClause: function (
      this: BeautifyFactory,
      item: ASTIfClause,
      _data: TransformerDataObject
    ): void {
      this.tokens.push({
        type: TokenType.Text,
        value: 'if ',
        ref: {
          start: item.start,
          end: item.start
        }
      });
      this.process(unwrap(item.condition));
      this.tokens.push({
        type: TokenType.Text,
        value: ' then',
        ref: {
          start: item.start,
          end: item.start
        }
      });

      this.tokens.push({
        type: TokenType.EndOfLine,
        value: '\n',
        ref: {
          start: item.start,
          end: item.start
        }
      });

      this.context.incIndent();
      this.context.buildBlock(item);
      this.context.decIndent();
    },
    ElseifClause: function (
      this: BeautifyFactory,
      item: ASTIfClause,
      _data: TransformerDataObject
    ): void {
      this.tokens.push({
        type: TokenType.Text,
        value: this.context.getIndent() + 'else if ',
        ref: {
          start: item.start,
          end: item.start
        }
      });
      this.process(unwrap(item.condition));
      this.tokens.push({
        type: TokenType.Text,
        value: ' then',
        ref: {
          start: item.start,
          end: item.start
        }
      });

      this.tokens.push({
        type: TokenType.EndOfLine,
        value: '\n',
        ref: {
          start: item.start,
          end: item.start
        }
      });

      this.context.incIndent();
      this.context.buildBlock(item);
      this.context.decIndent();
    },
    ElseClause: function (
      this: BeautifyFactory,
      item: ASTElseClause,
      _data: TransformerDataObject
    ): void {
      this.tokens.push({
        type: TokenType.Text,
        value: this.context.getIndent() + 'else',
        ref: {
          start: item.start,
          end: item.start
        }
      });
      this.tokens.push({
        type: TokenType.EndOfLine,
        value: '\n',
        ref: {
          start: item.start,
          end: item.start
        }
      });

      this.context.incIndent();
      this.context.buildBlock(item);
      this.context.decIndent();
    },
    ContinueStatement: function (
      this: BeautifyFactory,
      item: ASTBase,
      _data: TransformerDataObject
    ): void {
      this.tokens.push({
        type: TokenType.Text,
        value: 'continue',
        ref: item
      });
    },
    BreakStatement: function (
      this: BeautifyFactory,
      item: ASTBase,
      _data: TransformerDataObject
    ): void {
      this.tokens.push({
        type: TokenType.Text,
        value: 'break',
        ref: item
      });
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
        this.tokens.push({
          type: TokenType.Text,
          value: `#inject "${item.path}";`,
          ref: item
        });
        return;
      }
      if (this.currentDependency === null) {
        this.tokens.push({
          type: TokenType.Text,
          value: `#inject "${item.path}";`,
          ref: item
        });
        return;
      }

      const content = this.currentDependency.injections.get(item.path);

      if (content == null) {
        this.tokens.push({
          type: TokenType.Text,
          value: 'null',
          ref: item
        });
        return;
      }

      this.tokens.push({
        type: TokenType.Text,
        value: `"${content.replace(/"/g, '""')}"`,
        ref: item
      });
    },
    FeatureImportExpression: function (
      this: BeautifyFactory,
      item: ASTFeatureImportExpression,
      _data: TransformerDataObject
    ): void {
      if (this.transformer.buildOptions.isDevMode) {
        this.tokens.push({
          type: TokenType.Text,
          value: '#import ',
          ref: item
        });
        this.process(item.name);
        this.tokens.push({
          type: TokenType.Text,
          value: ` from "${item.path}";`,
          ref: item
        });
        return;
      }
      if (!item.chunk) {
        this.tokens.push({
          type: TokenType.Text,
          value: '#import ',
          ref: item
        });
        this.process(item.name);
        this.tokens.push({
          type: TokenType.Text,
          value: ` from "${item.path}";`,
          ref: item
        });
        return;
      }

      this.process(item.name);
      this.tokens.push({
        type: TokenType.Text,
        value: ' = __REQUIRE("' + item.namespace + '")',
        ref: item
      });
    },
    FeatureIncludeExpression: function (
      this: BeautifyFactory,
      item: ASTFeatureIncludeExpression,
      _data: TransformerDataObject
    ): void {
      if (this.transformer.buildOptions.isDevMode) {
        this.tokens.push({
          type: TokenType.Text,
          value: `#include "${item.path}";`,
          ref: item
        });
        return;
      }
      if (!item.chunk) {
        this.tokens.push({
          type: TokenType.Text,
          value: `#include "${item.path}";`,
          ref: item
        });
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
        this.tokens.push({
          type: TokenType.Text,
          value: 'debugger',
          ref: item
        });
        return;
      }
      this.tokens.push({
        type: TokenType.Text,
        value: '//debugger',
        ref: item
      });
    },
    FeatureLineExpression: function (
      this: BeautifyFactory,
      item: ASTBase,
      _data: TransformerDataObject
    ): void {
      if (this.transformer.buildOptions.isDevMode) {
        this.tokens.push({
          type: TokenType.Text,
          value: '#line',
          ref: item
        });
        return;
      }
      this.tokens.push({
        type: TokenType.Text,
        value: `${item.start.line}`,
        ref: item
      });
    },
    FeatureFileExpression: function (
      this: BeautifyFactory,
      item: ASTFeatureFileExpression,
      _data: TransformerDataObject
    ): void {
      if (this.transformer.buildOptions.isDevMode) {
        this.tokens.push({
          type: TokenType.Text,
          value: '#filename',
          ref: item
        });
        return;
      }
      this.tokens.push({
        type: TokenType.Text,
        value: `"${basename(item.filename).replace(/"/g, '"')}"`,
        ref: item
      });
    },
    ListConstructorExpression: function (
      this: BeautifyFactory,
      item: ASTListConstructorExpression,
      _data: TransformerDataObject
    ): void {
      if (item.fields.length === 0) {
        this.tokens.push({
          type: TokenType.Text,
          value: '[]',
          ref: item
        });

        return;
      }

      if (item.fields.length === 1) {
        this.tokens.push({
          type: TokenType.Text,
          value: '[ ',
          ref: item
        });
        this.process(item.fields[0]);
        this.tokens.push({
          type: TokenType.Text,
          value: ' ]',
          ref: item
        });
        return;
      }

      if (this.context.isMultilineAllowed) {
        this.context.incIndent();

        this.tokens.push({
          type: TokenType.Text,
          value: '[',
          ref: {
            start: item.start,
            end: item.start
          }
        });

        this.tokens.push({
          type: TokenType.EndOfLine,
          value: '\n',
          ref: {
            start: item.start,
            end: item.start
          }
        });

        for (let index = 0; index < item.fields.length; index++) {
          const fieldItem = item.fields[index];
          this.tokens.push({
            type: TokenType.Text,
            value: this.context.getIndent(),
            ref: fieldItem
          });
          this.process(fieldItem);
          this.tokens.push({
            type: TokenType.Text,
            value: ',',
            ref: fieldItem
          });
          this.tokens.push({
            type: TokenType.EndOfLine,
            value: '\n',
            ref: fieldItem
          });
        }

        this.context.decIndent();

        this.tokens.push({
          type: TokenType.Text,
          value: this.context.getIndent() + ']',
          ref: {
            start: item.end,
            end: item.end
          }
        });

        return;
      }

      this.tokens.push({
        type: TokenType.Text,
        value: '[ ',
        ref: item
      });

      for (let index = 0; index < item.fields.length; index++) {
        const fieldItem = item.fields[index];
        this.process(fieldItem);
        if (index !== item.fields.length - 1)
          this.tokens.push({
            type: TokenType.Text,
            value: ', ',
            ref: fieldItem
          });
      }

      this.tokens.push({
        type: TokenType.Text,
        value: ' ]',
        ref: item
      });
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
      this.tokens.push({
        type: TokenType.Text,
        value: getLiteralRawValue(item),
        ref: item
      });
    },
    EmptyExpression: function (
      this: BeautifyFactory,
      item: ASTBase,
      _data: TransformerDataObject
    ): void {
      this.tokens.push({
        type: TokenType.Text,
        value: '',
        ref: item
      });
    },
    IsaExpression: function (
      this: BeautifyFactory,
      item: ASTIsaExpression,
      data: TransformerDataObject
    ): void {
      this.process(item.left, {
        hasLogicalIndentActive: data.hasLogicalIndentActive
      });
      this.tokens.push({
        type: TokenType.Text,
        value: ' ' + item.operator + ' ',
        ref: item
      });
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

        this.tokens.push({
          type: TokenType.Text,
          value: ' ' + item.operator + ' ',
          ref: item
        });
        this.tokens.push({
          type: TokenType.EndOfLine,
          value: '\n',
          ref: item
        });
        this.tokens.push({
          type: TokenType.Text,
          value: this.context.getIndent(),
          ref: item
        });

        this.process(item.right, {
          hasLogicalIndentActive: true
        });

        if (!data.hasLogicalIndentActive) this.context.decIndent();

        return;
      }

      this.process(item.left, {
        hasLogicalIndentActive: data.hasLogicalIndentActive
      });

      this.tokens.push({
        type: TokenType.Text,
        value: ' ' + item.operator + ' ',
        ref: item
      });

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
        this.tokens.push({
          type: TokenType.Text,
          value: 'bitOr(',
          ref: item
        });
        this.process(item.left);
        this.tokens.push({
          type: TokenType.Text,
          value: ', ',
          ref: item
        });
        this.process(item.right);
        this.tokens.push({
          type: TokenType.Text,
          value: ')',
          ref: item
        });
        return;
      } else if (item.operator === '&') {
        this.tokens.push({
          type: TokenType.Text,
          value: 'bitAnd(',
          ref: item
        });
        this.process(item.left);
        this.tokens.push({
          type: TokenType.Text,
          value: ', ',
          ref: item
        });
        this.process(item.right);
        this.tokens.push({
          type: TokenType.Text,
          value: ')',
          ref: item
        });
        return;
      } else if (
        item.operator === '<<' ||
        item.operator === '>>' ||
        item.operator === '>>>'
      ) {
        throw new Error('Operators in binary expression are not supported');
      }

      this.process(item.left);
      this.tokens.push({
        type: TokenType.Text,
        value: ' ' + item.operator + ' ',
        ref: item
      });
      this.process(item.right);
    },
    BinaryNegatedExpression: function (
      this: BeautifyFactory,
      item: ASTUnaryExpression,
      _data: TransformerDataObject
    ): void {
      this.tokens.push({
        type: TokenType.Text,
        value: item.operator,
        ref: item
      });
      this.process(item.argument);
    },
    ComparisonGroupExpression: function (
      this: BeautifyFactory,
      item: ASTComparisonGroupExpression,
      _data: TransformerDataObject
    ): void {
      this.process(item.expressions[0]);

      for (let index = 0; index < item.operators.length; index++) {
        this.tokens.push({
          type: TokenType.Text,
          value: ' ' + item.operators[index] + ' ',
          ref: item
        });
        this.process(item.expressions[index + 1]);
      }
    },
    Chunk: function (
      this: BeautifyFactory,
      item: ASTChunk,
      _data: TransformerDataObject
    ): void {
      this.context.buildBlock(item);
    }
  };

  generateOptimizations(): string[] {
    return [];
  }
}
