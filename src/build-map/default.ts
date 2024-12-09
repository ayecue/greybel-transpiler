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
import { DefaultFactoryOptions, Factory, TokenType } from './factory';

export class DefaultFactory extends Factory<DefaultFactoryOptions> {
  transform(item: ASTChunk, dependency: DependencyLike): string {
    this._tokens = [];
    this._currentDependency = dependency;
    this.process(item);

    let output = '';

    for (let index = 0; index < this.tokens.length - 1; index++) {
      const token = this.tokens[index];

      if (token.type === TokenType.Text || token.type === TokenType.Comment) {
        output += token.value;
      } else if (token.type === TokenType.EndOfLine) {
        output += '\n';
      } else {
        throw new Error('Unknown token type!');
      }
    }

    return output;
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
      this.tokens.push({
        type: TokenType.Text,
        value: '(',
        ref: item
      });
      this.process(item.expression);
      this.tokens.push({
        type: TokenType.Text,
        value: ')',
        ref: item
      });
    },
    Comment: function (
      this: DefaultFactory,
      item: ASTComment,
      _data: TransformerDataObject
    ): void {
      if (item.isMultiline) {
        this.tokens.push({
          type: TokenType.Comment,
          value: item.value
            .split('\n')
            .map((line) => `//${line}`)
            .join('\n'),
          ref: item
        });
        return;
      }

      this.tokens.push({
        type: TokenType.Comment,
        value: '//' + item.value,
        ref: item
      });
    },
    AssignmentStatement: function (
      this: DefaultFactory,
      item: ASTAssignmentStatement,
      _data: TransformerDataObject
    ): void {
      const variable = item.variable;
      const init = item.init;

      this.process(variable);
      this.tokens.push({
        type: TokenType.Text,
        value: '=',
        ref: item
      });
      this.process(init);
    },
    MemberExpression: function (
      this: DefaultFactory,
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
      this: DefaultFactory,
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
              value: ',',
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
      }

      this.tokens.push({
        type: TokenType.EndOfLine,
        value: '\n',
        ref: {
          start: item.start,
          end: item.start
        }
      });

      for (const bodyItem of item.body) {
        const index = this.tokens.length;
        this.process(bodyItem);
        if (index < this.tokens.length)
          this.tokens.push({
            type: TokenType.EndOfLine,
            value: '\n',
            ref: {
              start: bodyItem.end,
              end: bodyItem.end
            }
          });
      }

      this.tokens.push({
        type: TokenType.Text,
        value: 'end function',
        ref: {
          start: item.end,
          end: item.end
        }
      });
    },
    MapConstructorExpression: function (
      this: DefaultFactory,
      item: ASTMapConstructorExpression,
      _data: TransformerDataObject
    ): void {
      this.tokens.push({
        type: TokenType.Text,
        value: '{',
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
            value: ',',
            ref: fieldItem
          });
      }

      this.tokens.push({
        type: TokenType.Text,
        value: '}',
        ref: {
          start: item.end,
          end: item.end
        }
      });
    },
    MapKeyString: function (
      this: DefaultFactory,
      item: ASTMapKeyString,
      _data: TransformerDataObject
    ): void {
      this.process(item.key);
      this.tokens.push({
        type: TokenType.Text,
        value: ':',
        ref: item
      });
      this.process(item.value);
    },
    Identifier: function (
      this: DefaultFactory,
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
      this: DefaultFactory,
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
      this: DefaultFactory,
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
      this: DefaultFactory,
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
      this.process(item.condition);
      this.tokens.push({
        type: TokenType.EndOfLine,
        value: '\n',
        ref: {
          start: item.start,
          end: item.start
        }
      });

      for (const bodyItem of item.body) {
        const index = this.tokens.length;
        this.process(bodyItem);
        if (index < this.tokens.length)
          this.tokens.push({
            type: TokenType.EndOfLine,
            value: '\n',
            ref: {
              start: bodyItem.end,
              end: bodyItem.end
            }
          });
      }

      this.tokens.push({
        type: TokenType.Text,
        value: 'end while',
        ref: {
          start: item.end,
          end: item.end
        }
      });
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

      this.tokens.push({
        type: TokenType.Text,
        value: '(',
        ref: {
          start: item.start,
          end: item.start
        }
      });

      for (let index = 0; index < item.arguments.length; index++) {
        const argItem = item.arguments[index];
        this.process(argItem);
        if (index !== item.arguments.length - 1)
          this.tokens.push({
            type: TokenType.Text,
            value: ',',
            ref: argItem
          });
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
      this: DefaultFactory,
      item: ASTLiteral,
      _data: TransformerDataObject
    ): void {
      this.tokens.push({
        type: TokenType.Text,
        value: getLiteralRawValue(item),
        ref: item
      });
    },
    SliceExpression: function (
      this: DefaultFactory,
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
        value: ':',
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
      this: DefaultFactory,
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
      this: DefaultFactory,
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
      this: DefaultFactory,
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
      this: DefaultFactory,
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
      this: DefaultFactory,
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
      this: DefaultFactory,
      item: ASTIfClause,
      _data: TransformerDataObject
    ): void {
      this.tokens.push({
        type: TokenType.Text,
        value: 'if ',
        ref: item
      });
      this.process(item.condition);
      this.tokens.push({
        type: TokenType.Text,
        value: ' then ',
        ref: item
      });
      this.process(item.body[0]);
    },
    ElseifShortcutClause: function (
      this: DefaultFactory,
      item: ASTIfClause,
      _data: TransformerDataObject
    ): void {
      this.tokens.push({
        type: TokenType.Text,
        value: 'else if ',
        ref: item
      });
      this.process(item.condition);
      this.tokens.push({
        type: TokenType.Text,
        value: ' then ',
        ref: item
      });
      this.process(item.body[0]);
    },
    ElseShortcutClause: function (
      this: DefaultFactory,
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
      this: DefaultFactory,
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
      this: DefaultFactory,
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
      this.process(item.variable);
      this.tokens.push({
        type: TokenType.Text,
        value: ' in ',
        ref: {
          start: item.start,
          end: item.start
        }
      });
      this.process(item.iterator);

      this.tokens.push({
        type: TokenType.EndOfLine,
        value: '\n',
        ref: {
          start: item.start,
          end: item.start
        }
      });

      for (const bodyItem of item.body) {
        const index = this.tokens.length;
        this.process(bodyItem);
        if (index < this.tokens.length)
          this.tokens.push({
            type: TokenType.EndOfLine,
            value: '\n',
            ref: {
              start: bodyItem.end,
              end: bodyItem.end
            }
          });
      }

      this.tokens.push({
        type: TokenType.Text,
        value: 'end for',
        ref: {
          start: item.end,
          end: item.end
        }
      });
    },
    IfStatement: function (
      this: DefaultFactory,
      item: ASTIfStatement,
      _data: TransformerDataObject
    ): void {
      for (const clausesItem of item.clauses) {
        this.process(clausesItem);
      }

      this.tokens.push({
        type: TokenType.Text,
        value: 'end if',
        ref: {
          start: item.end,
          end: item.end
        }
      });
    },
    IfClause: function (
      this: DefaultFactory,
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
      this.process(item.condition);
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

      for (const bodyItem of item.body) {
        const index = this.tokens.length;
        this.process(bodyItem);
        if (index < this.tokens.length)
          this.tokens.push({
            type: TokenType.EndOfLine,
            value: '\n',
            ref: {
              start: bodyItem.end,
              end: bodyItem.end
            }
          });
      }
    },
    ElseifClause: function (
      this: DefaultFactory,
      item: ASTIfClause,
      _data: TransformerDataObject
    ): void {
      this.tokens.push({
        type: TokenType.Text,
        value: 'else if ',
        ref: {
          start: item.start,
          end: item.start
        }
      });
      this.process(item.condition);
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

      for (const bodyItem of item.body) {
        const index = this.tokens.length;
        this.process(bodyItem);
        if (index < this.tokens.length)
          this.tokens.push({
            type: TokenType.EndOfLine,
            value: '\n',
            ref: {
              start: bodyItem.end,
              end: bodyItem.end
            }
          });
      }
    },
    ElseClause: function (
      this: DefaultFactory,
      item: ASTElseClause,
      _data: TransformerDataObject
    ): void {
      this.tokens.push({
        type: TokenType.Text,
        value: 'else',
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

      for (const bodyItem of item.body) {
        const index = this.tokens.length;
        this.process(bodyItem);
        if (index < this.tokens.length)
          this.tokens.push({
            type: TokenType.EndOfLine,
            value: '\n',
            ref: {
              start: bodyItem.end,
              end: bodyItem.end
            }
          });
      }
    },
    ContinueStatement: function (
      this: DefaultFactory,
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
      this: DefaultFactory,
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
        value: `"${content.replace(/"/g, () => '""')}"`,
        ref: item
      });
    },
    FeatureImportExpression: function (
      this: DefaultFactory,
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
      this: DefaultFactory,
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
      this: DefaultFactory,
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
      this: DefaultFactory,
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
      this: DefaultFactory,
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
        value: `"${basename(item.filename).replace(/"/g, () => '"')}"`,
        ref: item
      });
    },
    ListConstructorExpression: function (
      this: DefaultFactory,
      item: ASTListConstructorExpression,
      _data: TransformerDataObject
    ): void {
      this.tokens.push({
        type: TokenType.Text,
        value: '[',
        ref: item
      });

      for (let index = 0; index < item.fields.length; index++) {
        const fieldItem = item.fields[index];
        this.process(fieldItem);
        if (index !== item.fields.length - 1)
          this.tokens.push({
            type: TokenType.Text,
            value: ',',
            ref: fieldItem
          });
      }

      this.tokens.push({
        type: TokenType.Text,
        value: ']',
        ref: item
      });
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
      this.tokens.push({
        type: TokenType.Text,
        value: getLiteralRawValue(item),
        ref: item
      });
    },
    EmptyExpression: function (
      this: DefaultFactory,
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
      this: DefaultFactory,
      item: ASTIsaExpression,
      _data: TransformerDataObject
    ): void {
      this.process(item.left);
      this.tokens.push({
        type: TokenType.Text,
        value: ' ' + item.operator + ' ',
        ref: item
      });
      this.process(item.right);
    },
    LogicalExpression: function (
      this: DefaultFactory,
      item: ASTLogicalExpression,
      _data: TransformerDataObject
    ): void {
      this.process(item.left);
      this.tokens.push({
        type: TokenType.Text,
        value: ' ' + item.operator + ' ',
        ref: item
      });
      this.process(item.right);
    },
    BinaryExpression: function (
      this: DefaultFactory,
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
          value: ',',
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
          value: ',',
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
        value: item.operator,
        ref: item
      });
      this.process(item.right);
    },
    BinaryNegatedExpression: function (
      this: DefaultFactory,
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
      this: DefaultFactory,
      item: ASTComparisonGroupExpression,
      _data: TransformerDataObject
    ): void {
      this.process(item.expressions[0]);

      for (let index = 0; index < item.operators.length; index++) {
        this.tokens.push({
          type: TokenType.Text,
          value: item.operators[index],
          ref: item
        });
        this.process(item.expressions[index + 1]);
      }
    },
    Chunk: function (
      this: DefaultFactory,
      item: ASTChunkAdvancedOptions,
      _data: TransformerDataObject
    ): void {
      for (const bodyItem of item.body) {
        const index = this.tokens.length;
        this.process(bodyItem);
        if (index < this.tokens.length)
          this.tokens.push({
            type: TokenType.EndOfLine,
            value: '\n',
            ref: {
              start: bodyItem.end,
              end: bodyItem.end
            }
          });
      }
    }
  };

  generateOptimizations(): string[] {
    return [];
  }
}
