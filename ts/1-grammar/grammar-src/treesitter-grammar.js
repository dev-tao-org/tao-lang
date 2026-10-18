/// <reference types="tree-sitter-cli/dsl" />

export default grammar({
  name: 'tao',
  extras($) {
    return [/\s/, $.Comment]
  },
  rules: {
    SourceFile($) {
      return repeat(choice(
        $.AppDeclaration,
        $.ViewDeclaration,
        $.TestsDeclaration,
        $.LetDefinition,
        $.UseStatement,
        $.UsePackageStatement,
      ))
    },

    // Apps
    AppDeclaration($) {
      return seq(
        optional(field('visibility', $.Visibility)),
        'app',
        field('name', $.Identifier),
        '{',
        $.RootDeclaration,
        '}',
      )
    },
    RootDeclaration($) {
      return seq('root', field('view', $.QualifiedName))
    },

    // Views and rendering
    ViewDeclaration($) {
      return seq(
        optional(field('visibility', $.Visibility)),
        'view',
        field('name', $.Identifier),
        optional(field('parameters', $.ParameterList)),
        '{',
        repeat($.LetDefinition),
        $.RenderStatement,
        '}',
      )
    },
    RenderStatement($) {
      return seq('render', field('body', choice($.ViewRender, $.Injection)))
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
    ViewRender($) {
      return seq(
        optional(field('tag', $.RenderTag)),
        field('view', $.QualifiedName),
        optional(field('argumentList', $.ArgumentList)),
        optional(seq('{', repeat(field('children', choice($.ViewRender, $.LetDefinition))), '}')),
      )
    },

    // Lexical values
    LetDefinition($) {
      return seq(
        optional(field('visibility', $.Visibility)),
        'let',
        field('name', $.Identifier),
        optional(seq('is', field('type', $.QualifiedName))),
        '=',
        field('value', choice($.TextLiteral, $.QualifiedName)),
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
    ImportPath() {
      return /(@(?:[a-zA-Z0-9._\-]+)?(?:\/[a-zA-Z0-9._\-]+)*)|(\.\/[a-zA-Z0-9._\-@\/]*)|(\.\.(\/[a-zA-Z0-9._\-@]+)*\/?)|([a-zA-Z.][a-zA-Z0-9._\-]*\/[a-zA-Z0-9._\-@\/]*)/
    },
    Visibility() {
      return choice('file', 'folder', 'package', 'project', 'public')
    },

    // App tests and interactions
    TestsDeclaration($) {
      return seq('tests', optional(field('label', $.TextLiteral)), '{', repeat($.TestDeclaration), '}')
    },
    TestDeclaration($) {
      return seq(
        'test',
        optional(choice(
          field('label', $.TextLiteral),
          seq('(', optional(seq(optional('Label'), field('label', $.TextLiteral))), ')'),
        )),
        '{',
        repeat(choice($.RunStatement, $.PressStatement, $.TypeStatement, $.ExpectStatement)),
        '}',
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
          seq(
            optional(field('target', $.RenderTag)),
            '{',
            repeat(choice($.TextExpectation, $.InputValueExpectation)),
            '}',
          ),
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
          choice($.TextLiteral, $.QualifiedName),
          repeat(seq(',', choice($.TextLiteral, $.QualifiedName))),
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
