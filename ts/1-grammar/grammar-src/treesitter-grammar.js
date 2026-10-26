/// <reference types="tree-sitter-cli/dsl" />

export default grammar({
  name: 'tao',
  extras($) {
    return [/\s/, $.Comment]
  },
  supertypes: $ => [$._Declaration, $._Expression, $._ViewRenderStatement],
  rules: {
    SourceFile($) {
      return repeat($._Declaration)
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
      )
    },
    _Expression($) {
      return choice($.QualifiedName, $.TextLiteral)
    },
    _ViewRenderStatement($) {
      return choice($.RenderInjectStatement, $.RenderViewExpressionStatement)
    },
    _AppBlock($) {
      return seq('{', field('statements', $.RootDeclaration), '}')
    },
    _ViewDeclarationBlock($) {
      return seq(
        '{',
        repeat(field('statements', $.LetDeclaration)),
        field('statements', $._ViewRenderStatement),
        repeat(field('statements', alias($._NestedViewDeclaration, $.ViewDeclaration))),
        '}',
      )
    },
    _NestedViewDeclaration($) {
      return seq(
        'view',
        field('name', $.Identifier),
        optional(field('parameters', $.ParameterList)),
        field('body', choice(alias($._ViewDeclarationBlock, $.Block), $.ForeignView)),
      )
    },
    _ViewRenderBlock($) {
      return seq(
        '{',
        repeat(field('statements', choice($.LetDeclaration, $.ViewRenderExpression))),
        '}',
      )
    },
    _TestsBlock($) {
      return seq('{', repeat(field('statements', $.TestDeclaration)), '}')
    },
    _TestBlock($) {
      return seq(
        '{',
        repeat(field('statements', choice($.RunStatement, $.PressStatement, $.TypeStatement, $.ExpectStatement))),
        '}',
      )
    },
    _ExpectationBlock($) {
      return seq('{', repeat(field('statements', choice($.TextExpectation, $.InputValueExpectation))), '}')
    },

    // Apps and views
    AppDeclaration($) {
      return seq(
        optional(field('visibility', $.Visibility)),
        'app',
        field('name', $.Identifier),
        field('block', alias($._AppBlock, $.Block)),
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
        field('body', choice(alias($._ViewDeclarationBlock, $.Block), $.ForeignView)),
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
      return /@@[A-Za-z_][A-Za-z0-9_]*/
    },
    TypeScript() {
      return token(seq('```ts', repeat(choice(/[^`]/, /`[^`]/, /``[^`]/)), '```'))
    },
    ViewRenderExpression($) {
      return seq(
        optional(field('tag', $.RenderTag)),
        field('view', $.QualifiedName),
        optional(field('argumentList', $.ArgumentList)),
        optional(field('block', alias($._ViewRenderBlock, $.Block))),
      )
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
    UseStatement($) {
      return choice(
        seq('use', field('all', $.All), 'from', field('from', $.ImportPath)),
        seq(
          'use',
          field('imports', $.NamedImport),
          repeat(seq(',', field('imports', $.NamedImport))),
          optional(seq('from', field('from', $.ImportPath))),
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
      return token(choice(/\.\.\/[A-Za-z0-9._@/-]+/, /@[A-Za-z0-9._-]+\/[A-Za-z0-9._@/-]+/, /[A-Za-z0-9._@/-]+/))
    },
    RequirementVersion() {
      return token(/[A-Za-z0-9._+-]+/)
    },
    ImportPath() {
      return /(@(?:[a-zA-Z0-9._\-]+)?(?:\/[a-zA-Z0-9._\-]+)*)|(\.\/[a-zA-Z0-9._\-@\/]*)|(\.\.(\/[a-zA-Z0-9._\-@]+)*\/?)|([a-zA-Z.][a-zA-Z0-9._\-]*\/[a-zA-Z0-9._\-@\/]*)|([a-zA-Z0-9._-]+@[a-zA-Z0-9._@/-]+\/?[a-zA-Z0-9._@/-]*)/
    },
    Visibility() {
      return choice('file', 'folder', 'package', 'project', 'public')
    },

    // App tests and interactions
    TestsDeclaration($) {
      return seq('tests', optional(field('label', $.TextLiteral)), field('block', alias($._TestsBlock, $.Block)))
    },
    TestDeclaration($) {
      return seq(
        'test',
        optional(choice(
          field('label', $.TextLiteral),
          seq('(', optional(seq(optional('Label'), field('label', $.TextLiteral))), ')'),
        )),
        field('block', alias($._TestBlock, $.Block)),
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
          seq(optional(field('target', $.RenderTag)), field('block', alias($._ExpectationBlock, $.Block))),
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
      return /#[A-Za-z_][A-Za-z0-9_-]*/
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
      return token(seq('"', repeat(choice(/[^"\\\r\n\u0000-\u001f]/, /\\(?:["\\/bfnrt]|u[0-9a-fA-F]{4})/)), '"'))
    },

    // Names
    Comment() {
      return token(choice(/\/\/[^\n\r]*/, /\/\*[^*]*\*+([^/*][^*]*\*+)*\//))
    },
    Identifier() {
      return /[A-Za-z_][A-Za-z0-9_]*/
    },
    QualifiedName($) {
      return seq($.Identifier, repeat(seq('.', $.Identifier)))
    },
  },
})
