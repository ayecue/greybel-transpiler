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

import { Dependency } from '../dependency';
import { DependencyLike, DependencyType } from '../types/dependency';
import { TransformerDataObject, TransformerLike } from '../types/transformer';
import { createExpressionString } from '../utils/create-expression-string';
import {
  getLiteralRawValue,
  getLiteralValue
} from '../utils/get-literal-value';
import { merge } from '../utils/merge';
import { DefaultFactoryOptions, Factory } from './factory';

export interface UglifyOptions extends DefaultFactoryOptions {
  disableLiteralsOptimization?: boolean;
  disableNamespacesOptimization?: boolean;
}

export class UglifyFactory extends Factory<DefaultFactoryOptions> {
  readonly disableLiteralsOptimization: boolean;
  readonly disableNamespacesOptimization: boolean;

  private forIdxMapping: Map<string, string>;
  private isWithinArgument: boolean;

  constructor(transformer: TransformerLike<UglifyOptions>) {
    super(transformer);

    this.disableLiteralsOptimization =
      transformer.buildOptions.disableLiteralsOptimization ?? false;
    this.disableNamespacesOptimization =
      transformer.buildOptions.disableNamespacesOptimization ?? false;
    this.forIdxMapping = new Map();
    this.isWithinArgument = false;
  }

  transform(item: ASTChunkGreybel, dependency: DependencyLike): string {
    this.reset();
    this._originDependency = dependency;
    this._activeDependency = dependency;
    this.process(item);

    return this._lines
      .map((line) => {
        return line.segments.join('');
      })
      .join('\n');
  }

  handlers: Record<
    string,
    (this: UglifyFactory, item: ASTBase, data: TransformerDataObject) => void
  > = {
    ParenthesisExpression: function (
      this: UglifyFactory,
      item: ASTParenthesisExpression,
      _data: TransformerDataObject
    ): void {
      this.pushSegment('(');
      this.process(item.expression);
      this.pushSegment(')');
    },
    Comment: function (
      this: UglifyFactory,
      _item: ASTComment,
      _data: TransformerDataObject
    ): void {},
    AssignmentStatement: function (
      this: UglifyFactory,
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
      this: UglifyFactory,
      item: ASTMemberExpression,
      _data: TransformerDataObject
    ): void {
      this.process(item.base);
      this.pushSegment(item.indexer);
      const idtfr = createExpressionString(item.base);

      this.process(item.identifier, {
        usesNativeVar:
          idtfr === 'globals' || idtfr === 'locals' || idtfr === 'outer',
        isMember: true
      });
    },
    FunctionDeclaration: function (
      this: UglifyFactory,
      item: ASTFunctionStatement,
      _data: TransformerDataObject
    ): void {
      if (item.parameters.length === 0) {
        this.pushSegment('function');
      } else {
        this.pushSegment('function(');

        this.isWithinArgument = true;
        for (let index = 0; index < item.parameters.length; index++) {
          const arg = item.parameters[index];
          this.process(arg);
          if (index !== item.parameters.length - 1) {
            this.pushSegment(',');
          }
        }
        this.isWithinArgument = false;

        this.pushSegment(')');
      }

      this.eol();

      for (const bodyItem of item.body) {
        this.process(bodyItem);
        if (this._activeLine.segments.length > 0) {
          this.eol();
        }
      }

      this.pushSegment('end function');
    },
    MapConstructorExpression: function (
      this: UglifyFactory,
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
      this: UglifyFactory,
      item: ASTMapKeyString,
      _data: TransformerDataObject
    ): void {
      this.process(item.key);
      this.pushSegment(':');
      this.process(item.value);
    },
    Identifier: function (
      this: UglifyFactory,
      item: ASTIdentifier,
      data: TransformerDataObject
    ): void {
      let name = item.name;

      if (this.disableNamespacesOptimization) {
        this.pushSegment(name);
        return;
      }

      if (data.isMember && data.usesNativeVar) {
        name =
          this.forIdxMapping.get(name) ||
          this.transformer.context.variables.get(name) ||
          name;
      } else if (!data.isMember) {
        name =
          this.forIdxMapping.get(name) ||
          this.transformer.context.variables.get(name) ||
          name;
      }

      if (data.isForVariable && item.name !== name) {
        const idxVarName = `__${item.name}_idx`;
        const idxOptimizedVarName = `__${name}_idx`;
        this.forIdxMapping.set(idxVarName, idxOptimizedVarName);
      }

      this.pushSegment(name);
    },
    ReturnStatement: function (
      this: UglifyFactory,
      item: ASTReturnStatement,
      _data: TransformerDataObject
    ): void {
      this.pushSegment('return ');
      if (item.argument) this.process(item.argument);
    },
    NumericLiteral: function (
      this: UglifyFactory,
      item: ASTNumericLiteral,
      _data: TransformerDataObject
    ): void {
      if (this.disableLiteralsOptimization) {
        this.pushSegment(getLiteralValue(item));
        return;
      }

      const literal = this.transformer.context.literals.get(item);

      if (
        !this.isWithinArgument &&
        literal !== null &&
        literal.namespace !== null
      ) {
        this.pushSegment(literal.namespace);
        return;
      }

      this.pushSegment(getLiteralValue(item));
    },
    WhileStatement: function (
      this: UglifyFactory,
      item: ASTWhileStatement,
      _data: TransformerDataObject
    ): void {
      this.pushSegment('while ');
      this.process(item.condition);
      this.eol();

      for (const bodyItem of item.body) {
        this.process(bodyItem);
        if (this._activeLine.segments.length > 0) {
          this.eol();
        }
      }

      this.pushSegment('end while');
    },
    CallExpression: function (
      this: UglifyFactory,
      item: ASTCallExpression,
      _data: TransformerDataObject
    ): void {
      const idtfr = createExpressionString(item.base);
      const isNativeVarHasIndex =
        idtfr === 'globals.hasIndex' ||
        idtfr === 'locals.hasIndex' ||
        idtfr === 'outer.hasIndex';
      let argItem;

      this.process(item.base);

      if (isNativeVarHasIndex) {
        argItem = item.arguments[0];

        if (argItem.type === 'StringLiteral') {
          const namespace = getLiteralValue(argItem as ASTLiteral);
          const optNamespace =
            this.transformer.context.variables.get(namespace);
          this.pushSegment('("' + (optNamespace ?? namespace) + '")');
          return;
        }

        this.pushSegment('(');
        this.process(argItem);
        this.pushSegment(')');
        return;
      }

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
      this: UglifyFactory,
      item: ASTLiteral,
      _data: TransformerDataObject
    ): void {
      if (this.disableLiteralsOptimization) {
        this.pushSegment(getLiteralRawValue(item));
        return;
      }

      const literal = this.transformer.context.literals.get(item);

      if (
        !this.isWithinArgument &&
        literal !== null &&
        literal.namespace !== null
      ) {
        this.pushSegment(literal.namespace);
        return;
      }

      this.pushSegment(getLiteralRawValue(item));
    },
    SliceExpression: function (
      this: UglifyFactory,
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
      this: UglifyFactory,
      item: ASTIndexExpression,
      _data: TransformerDataObject
    ): void {
      this.process(item.base);
      this.pushSegment('[');
      this.process(item.index);
      this.pushSegment(']');
    },
    UnaryExpression: function (
      this: UglifyFactory,
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
      this: UglifyFactory,
      item: ASTUnaryExpression,
      _data: TransformerDataObject
    ): void {
      this.pushSegment(item.operator + ' ');
      this.process(item.argument);
    },
    FeatureEnvarExpression: function (
      this: UglifyFactory,
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
    FeatureDebuggerExpression: function (
      this: UglifyFactory,
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
      this: UglifyFactory,
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
      this: UglifyFactory,
      item: ASTFeatureFileExpression,
      _data: TransformerDataObject
    ): void {
      if (this.transformer.buildOptions.isDevMode) {
        this.pushSegment('#filename');
        return;
      }
      this.pushSegment(`"${basename(item.filename).replace(/"/g, () => '"')}"`);
    },
    IfShortcutStatement: function (
      this: UglifyFactory,
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
      this: UglifyFactory,
      item: ASTIfClause,
      _data: TransformerDataObject
    ): void {
      this.pushSegment('if ');
      this.process(item.condition);
      this.pushSegment(' then ');
      this.process(item.body[0]);
    },
    ElseifShortcutClause: function (
      this: UglifyFactory,
      item: ASTIfClause,
      _data: TransformerDataObject
    ): void {
      this.pushSegment(' else if ');
      this.process(item.condition);
      this.pushSegment(' then');
      this.process(item.body[0]);
    },
    ElseShortcutClause: function (
      this: UglifyFactory,
      item: ASTElseClause,
      _data: TransformerDataObject
    ): void {
      this.pushSegment('else ');
      this.process(item.body[0]);
    },
    NilLiteral: function (
      this: UglifyFactory,
      item: ASTLiteral,
      _data: TransformerDataObject
    ): void {
      if (this.disableLiteralsOptimization) {
        this.pushSegment(getLiteralRawValue(item));
        return;
      }

      const literal = this.transformer.context.literals.get(item);

      if (
        !this.isWithinArgument &&
        literal !== null &&
        literal.namespace !== null
      ) {
        this.pushSegment(literal.namespace);
        return;
      }

      this.pushSegment(getLiteralRawValue(item));
    },
    ForGenericStatement: function (
      this: UglifyFactory,
      item: ASTForGenericStatement,
      _data: TransformerDataObject
    ): void {
      this.pushSegment('for ');
      this.process(item.variable, { isForVariable: true });
      this.pushSegment(' in ');
      this.process(item.iterator);
      this.eol();

      for (const bodyItem of item.body) {
        this.process(bodyItem);
        if (this._activeLine.segments.length > 0) {
          this.eol();
        }
      }

      this.pushSegment('end for');
    },
    IfStatement: function (
      this: UglifyFactory,
      item: ASTIfStatement,
      _data: TransformerDataObject
    ): void {
      for (const clausesItem of item.clauses) {
        this.process(clausesItem);
      }

      this.pushSegment('end if');
    },
    IfClause: function (
      this: UglifyFactory,
      item: ASTIfClause,
      _data: TransformerDataObject
    ): void {
      this.pushSegment('if ');
      this.process(item.condition);
      this.pushSegment(' then');
      this.eol();

      for (const bodyItem of item.body) {
        this.process(bodyItem);
        if (this._activeLine.segments.length > 0) {
          this.eol();
        }
      }
    },
    ElseifClause: function (
      this: UglifyFactory,
      item: ASTIfClause,
      _data: TransformerDataObject
    ): void {
      this.pushSegment('else if ');
      this.process(item.condition);
      this.pushSegment(' then');
      this.eol();

      for (const bodyItem of item.body) {
        this.process(bodyItem);
        if (this._activeLine.segments.length > 0) {
          this.eol();
        }
      }
    },
    ElseClause: function (
      this: UglifyFactory,
      item: ASTElseClause,
      _data: TransformerDataObject
    ): void {
      this.pushSegment('else');
      this.eol();

      for (const bodyItem of item.body) {
        this.process(bodyItem);
        if (this._activeLine.segments.length > 0) {
          this.eol();
        }
      }
    },
    ContinueStatement: function (
      this: UglifyFactory,
      item: ASTBase,
      _data: TransformerDataObject
    ): void {
      this.pushSegment('continue');
    },
    BreakStatement: function (
      this: UglifyFactory,
      item: ASTBase,
      _data: TransformerDataObject
    ): void {
      this.pushSegment('break');
    },
    CallStatement: function (
      this: UglifyFactory,
      item: ASTCallStatement,
      _data: TransformerDataObject
    ): void {
      this.process(item.expression);
    },
    FeatureInjectExpression: function (
      this: UglifyFactory,
      item: ASTFeatureInjectExpression,
      _data: TransformerDataObject
    ): void {
      if (this.transformer.buildOptions.isDevMode) {
        this.pushSegment(`#inject "${item.path}"`);
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
      this: UglifyFactory,
      item: ASTFeatureImportExpression,
      _data: TransformerDataObject
    ): void {
      if (this.transformer.buildOptions.isDevMode) {
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

      if (this.disableNamespacesOptimization) {
        this.pushSegment(`=__REQUIRE("${item.namespace}")`);
        return;
      }

      const requireMethodName =
        this.transformer.context.variables.get('__REQUIRE');

      this.pushSegment(
        `=${requireMethodName}("${associatedDependency.getNamespace()}")`
      );
    },
    FeatureIncludeExpression: function (
      this: UglifyFactory,
      item: ASTFeatureIncludeExpression,
      _data: TransformerDataObject
    ): void {
      if (this.transformer.buildOptions.isDevMode) {
        this.pushSegment(`#include "${item.path}";`);
        return;
      }
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
    ListConstructorExpression: function (
      this: UglifyFactory,
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
      this: UglifyFactory,
      item: ASTListValue,
      _data: TransformerDataObject
    ): void {
      this.process(item.value);
    },
    BooleanLiteral: function (
      this: UglifyFactory,
      item: ASTBooleanLiteral,
      _data: TransformerDataObject
    ): void {
      if (this.disableLiteralsOptimization) {
        this.pushSegment(getLiteralRawValue(item, true));
        return;
      }

      const literal = this.transformer.context.literals.get(item);

      if (
        !this.isWithinArgument &&
        literal !== null &&
        literal.namespace !== null
      ) {
        this.pushSegment(literal.namespace);
        return;
      }

      this.pushSegment(getLiteralRawValue(item, true));
    },
    EmptyExpression: function (
      this: UglifyFactory,
      item: ASTBase,
      _data: TransformerDataObject
    ): void {
      this.pushSegment('');
    },
    IsaExpression: function (
      this: UglifyFactory,
      item: ASTIsaExpression,
      _data: TransformerDataObject
    ): void {
      this.process(item.left);
      this.pushSegment(' ' + item.operator + ' ');
      this.process(item.right);
    },
    LogicalExpression: function (
      this: UglifyFactory,
      item: ASTLogicalExpression,
      _data: TransformerDataObject
    ): void {
      this.process(item.left);
      this.pushSegment(' ' + item.operator + ' ');
      this.process(item.right);
    },
    BinaryExpression: function (
      this: UglifyFactory,
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
      this: UglifyFactory,
      item: ASTUnaryExpression,
      _data: TransformerDataObject
    ): void {
      this.pushSegment(item.operator);
      this.process(item.argument);
    },
    ComparisonGroupExpression: function (
      this: UglifyFactory,
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
      this: UglifyFactory,
      item: ASTChunkGreybel,
      _data: TransformerDataObject
    ): void {
      for (const bodyItem of item.body) {
        this.process(bodyItem);
        if (this._activeLine.segments.length > 0) {
          this.eol();
        }
      }
    }
  };

  generateOptimizations(): string[] {
    const context = this.transformer.context;
    const literalMapping = Array.from(
      context.literals.getMapping().values()
    ).filter((literal) => literal.namespace != null);
    const tempVarForGlobal = context.variables.get('globals');
    const lines = [];

    if (!this.disableNamespacesOptimization || literalMapping.length > 0) {
      lines.push(`globals.${tempVarForGlobal}=globals`);
    }

    if (literalMapping.length > 0) {
      const literals = literalMapping.map((meta) => {
        return `${tempVarForGlobal}.${meta.namespace}=${getLiteralRawValue(
          meta.literal
        )}`;
      });
      merge(lines, literals);
    }

    return lines;
  }
}
