/// <reference types="tree-sitter-cli/dsl" />

const WhitespaceCharacterRegx = /\s/
const ContextReferenceRegx = /@@[A-Za-z_][A-Za-z0-9_]*/
const TypeScriptTextCharacterRegx = /[^`]/
const TypeScriptSingleBacktickRegx = /`[^`]/
const TypeScriptDoubleBacktickRegx = /``[^`]/
const RelativeRequirementIdentifierRegx = /\.\.\/[A-Za-z0-9._@/-]+/
const ScopedRequirementIdentifierRegx = /@[A-Za-z0-9._-]+\/[A-Za-z0-9._@/-]+/
const RequirementIdentifierRegx = /[A-Za-z0-9._@/-]+/
const RequirementVersionRegx = /[A-Za-z0-9._+-]+/
const ImportPathRegx =
  /(@(?:[a-zA-Z0-9._\-]+)?(?:\/[a-zA-Z0-9._\-]+)*)|(\.\/[a-zA-Z0-9._\-@\/]*)|(\.\.(\/[a-zA-Z0-9._\-@]+)*\/?)|([a-zA-Z.][a-zA-Z0-9._\-]*\/[a-zA-Z0-9._\-@\/]*)|([a-zA-Z0-9._-]+@[a-zA-Z0-9._@/-]+\/?[a-zA-Z0-9._@/-]*)/
const RenderTagRegx = /#[A-Za-z_][A-Za-z0-9_-]*/
const TextLiteralCharacterRegx = /[^"\\\r\n\u0000-\u001f]/
const TextLiteralEscapeRegx = /\\(?:["\\/bfnrt]|u[0-9a-fA-F]{4})/
const LineCommentRegx = /\/\/[^\n\r]*/
const BlockCommentRegx = /\/\*[^*]*\*+([^/*][^*]*\*+)*\//
const IdentifierRegx = /[A-Za-z_][A-Za-z0-9_]*/
const BooleanKeywords = ['yes', 'no']
const VisibilityKeywords = ['file', 'folder', 'package', 'project', 'public']
const StatementKeywords = [
  'app',
  'root',
  'view',
  'render',
  'let',
  'publish',
  'use',
  'requires',
  'tests',
  'test',
  'run',
  'press',
  'type',
  'expect',
  'text',
  'input',
  ...VisibilityKeywords,
]

export default grammar({
  name: 'tao',
  extras($) {
    return [WhitespaceCharacterRegx, $.Comment]
  },
  word: $ => $.Identifier,
  supertypes: $ => [$._Declaration, $._Expression, $._Statement, $._ViewRenderStatement],
  rules: {
    SourceFile($) {
      return repeat($._Statement)
    },
    _Statement($) {
      return choice(
        $._Declaration,
        $.RootDeclaration,
        $._ViewRenderStatement,
        $.ViewRenderExpression,
        alias($._QualifiedKeywordView, $.ViewRenderExpression),
        $.TestDeclaration,
        $.RunStatement,
        $.PressStatement,
        $.TypeStatement,
        $.ExpectStatement,
        $.TextExpectation,
        $.InputExpectation,
        $.InputValueExpectation,
      )
    },
    _Declaration($) {
      return choice(
        $.AppDeclaration,
        $.ViewDeclaration,
        $.TestsDeclaration,
        $.LetDeclaration,
        $.UseStatement,
        $.UsePackageStatement,
        $.RequiresDeclaration,
        $.TypeScriptLibraryDeclaration,
        $.PublishDeclaration,
      )
    },
    _Expression($) {
      return choice($._BooleanOrName, $.TextLiteral)
    },
    _BooleanOrName($) {
      return choice($.BooleanLiteral, $.QualifiedName, alias($._QualifiedBooleanName, $.QualifiedName))
    },
    _ViewRenderStatement($) {
      return choice($.RenderInjectStatement, $.RenderViewExpressionStatement)
    },
    Block($) {
      return seq('{', repeat(field('statements', $._Statement)), '}')
    },

    // Apps and views
    AppDeclaration($) {
      return seq(
        optional(field('visibility', $.Visibility)),
        'app',
        field('name', $.Identifier),
        field('block', $.Block),
      )
    },
    RootDeclaration($) {
      return seq('root', field('view', $.QualifiedName))
    },
    ViewDeclaration($) {
      return seq(
        optional(field('visibility', $.Visibility)),
        'view',
        field('name', $.Identifier),
        optional(field('parameters', $.ParameterList)),
        field('body', choice($.Block, $.ForeignView)),
      )
    },
    ForeignView($) {
      return seq('from', field('path', $.ImportPath))
    },
    RenderInjectStatement($) {
      return seq('render', field('injection', $.Injection))
    },
    RenderViewExpressionStatement($) {
      return seq('render', field('expression', $.ViewRenderExpression))
    },

    // View parameters and native injection boundaries
    ParameterList($) {
      return seq('(', optional(seq($.Parameter, repeat(seq(',', $.Parameter)))), ')')
    },
    Parameter($) {
      return seq(field('name', $.Identifier), field('type', $.QualifiedName))
    },
    Injection($) {
      return seq(
        'inject',
        optional(seq($.InjectionCapture, repeat(seq(',', $.InjectionCapture)))),
        field('code', $.TypeScript),
      )
    },
    InjectionCapture($) {
      return seq(field('name', $.Identifier), optional(field('value', choice($.QualifiedName, $.ContextReference))))
    },
    ContextReference() {
      return ContextReferenceRegx
    },
    TypeScript() {
      return token(
        seq(
          '```ts',
          repeat(choice(TypeScriptTextCharacterRegx, TypeScriptSingleBacktickRegx, TypeScriptDoubleBacktickRegx)),
          '```',
        ),
      )
    },
    ViewRenderExpression($) {
      return seq(
        optional(field('tag', $.RenderTag)),
        field('view', $.QualifiedName),
        optional(field('argumentList', $.ArgumentList)),
        optional(field('interaction', $.DisabledModifier)),
        optional(field('block', $.Block)),
      )
    },
    DisabledModifier($) {
      return seq('[', 'disabled', field('condition', $._BooleanOrName), ']')
    },

    // A namespace derived from a package path can share a statement keyword.
    _QualifiedKeywordView($) {
      return seq(
        choice(
          field('view', alias($._QualifiedKeywordName, $.QualifiedName)),
          seq(field('tag', $.RenderTag), field('view', alias($._TaggedInputName, $.QualifiedName))),
        ),
        optional(field('argumentList', $.ArgumentList)),
        optional(field('interaction', $.DisabledModifier)),
        optional(field('block', $.Block)),
      )
    },
    _QualifiedKeywordName($) {
      const head = choice(...StatementKeywords.map(keyword => alias(keyword, $.Identifier)))
      return seq(head, repeat1(seq('.', $.Identifier)))
    },
    _TaggedInputName($) {
      return seq(alias('input', $.Identifier), repeat1(seq('.', $.Identifier)))
    },

    // Lexical values
    LetDeclaration($) {
      return seq(
        optional(field('visibility', $.Visibility)),
        'let',
        field('name', $.Identifier),
        optional(seq('is', field('type', $.QualifiedName))),
        '=',
        field('value', $._Expression),
      )
    },

    // Modules
    TypeScriptLibraryDeclaration($) {
      return seq('ts-library', field('name', $.Identifier), field('block', $.Block))
    },
    PublishDeclaration($) {
      return seq(
        'publish',
        '{',
        optional(
          seq(field('members', $.Identifier), repeat(seq(',', field('members', $.Identifier))), optional(',')),
        ),
        '}',
      )
    },
    UseStatement($) {
      return choice(
        seq('use', field('from', $.ImportPath), field('all', $.All)),
        seq(
          'use',
          optional(field('from', $.ImportPath)),
          field('imports', $.NamedImport),
          repeat(seq(',', field('imports', $.NamedImport))),
        ),
      )
    },
    NamedImport($) {
      return seq(field('target', $.Identifier), optional(seq('as', field('alias', $.Identifier))))
    },
    All() {
      return 'all'
    },
    UsePackageStatement($) {
      return seq('use', 'package', field('from', $.ImportPath), optional(seq('as', field('alias', $.Identifier))))
    },
    RequiresDeclaration($) {
      return seq(
        'requires',
        field('provider', $.RequirementProvider),
        ':',
        field('identifier', $.RequirementIdentifier),
        optional(seq('version', field('version', $.RequirementVersion))),
        optional(seq('as', field('alias', $.Identifier))),
      )
    },
    RequirementProvider() {
      return choice('github', 'file', 'npm', 'bundled')
    },
    RequirementIdentifier() {
      return token(
        choice(RelativeRequirementIdentifierRegx, ScopedRequirementIdentifierRegx, RequirementIdentifierRegx),
      )
    },
    RequirementVersion() {
      return token(RequirementVersionRegx)
    },
    ImportPath() {
      return ImportPathRegx
    },
    Visibility() {
      return choice(...VisibilityKeywords)
    },

    // App tests and interactions
    TestsDeclaration($) {
      return seq('tests', optional(field('label', $.TextLiteral)), field('block', $.Block))
    },
    TestDeclaration($) {
      return prec.dynamic(
        1,
        seq(
          'test',
          optional(choice(
            field('label', $.TextLiteral),
            seq('(', optional(seq(optional('Label'), field('label', $.TextLiteral))), ')'),
          )),
          field('block', $.Block),
        ),
      )
    },
    RunStatement($) {
      return seq('run', field('app', $.QualifiedName))
    },
    PressStatement($) {
      return seq('press', field('target', $.RenderTag))
    },
    TypeStatement($) {
      return seq('type', field('value', $.TextLiteral), 'into', field('target', $.RenderTag))
    },
    ExpectStatement($) {
      return seq(
        'expect',
        choice(
          $.TextExpectation,
          $.InputExpectation,
          seq(optional(field('target', $.RenderTag)), field('block', $.Block)),
        ),
      )
    },
    TextExpectation($) {
      return seq('text', field('value', $.TextLiteral))
    },
    InputExpectation($) {
      return seq(field('target', $.RenderTag), 'input', 'value', field('value', $.TextLiteral))
    },
    InputValueExpectation($) {
      return seq('input', 'value', field('value', $.TextLiteral))
    },
    RenderTag() {
      return RenderTagRegx
    },

    // Expressions
    ArgumentList($) {
      return seq(
        '(',
        optional(seq(
          $._Expression,
          repeat(seq(',', $._Expression)),
        )),
        ')',
      )
    },
    TextLiteral() {
      return token(seq('"', repeat(choice(TextLiteralCharacterRegx, TextLiteralEscapeRegx)), '"'))
    },
    BooleanLiteral() {
      return choice(...BooleanKeywords)
    },

    // Names
    Comment() {
      return token(choice(LineCommentRegx, BlockCommentRegx))
    },
    Identifier() {
      return IdentifierRegx
    },
    // A boolean keyword can also be the first part of a derived package namespace.
    _QualifiedBooleanName($) {
      const head = choice(...BooleanKeywords.map(keyword => alias(keyword, $.Identifier)))
      return seq(head, repeat1(seq('.', $.Identifier)))
    },
    QualifiedName($) {
      return seq($.Identifier, repeat(seq('.', $.Identifier)))
    },
  },
})
