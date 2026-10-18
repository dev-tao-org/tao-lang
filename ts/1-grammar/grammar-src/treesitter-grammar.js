/// <reference types="tree-sitter-cli/dsl" />

export default grammar({
  name: 'tao',
  extras() {
    return [/\s/]
  },
  rules: {
    SourceFile($) {
      return repeat(choice($.AppDeclaration, $.ViewDeclaration))
    },

    // Apps
    AppDeclaration($) {
      return seq('app', field('name', $.Identifier), '{', $.RootDeclaration, '}')
    },
    RootDeclaration($) {
      return seq('root', field('view', $.Identifier))
    },

    // Views and rendering
    ViewDeclaration($) {
      return seq(
        'view',
        field('name', $.Identifier),
        optional(field('parameters', $.ParameterList)),
        '{',
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
      return seq(field('name', $.Identifier), field('type', $.Identifier))
    },
    Injection($) {
      return seq(
        'inject',
        optional(seq($.InjectionCapture, repeat(seq(',', $.InjectionCapture)))),
        field('code', $.TypeScript),
      )
    },
    InjectionCapture($) {
      return seq(field('name', $.Identifier), optional(field('value', choice($.Identifier, $.ContextReference))))
    },
    ContextReference() {
      return /@@[A-Za-z_][A-Za-z0-9_]*/
    },
    TypeScript() {
      return token(seq('```ts', repeat(choice(/[^`]/, /`[^`]/, /``[^`]/)), '```'))
    },
    ViewRender($) {
      return seq(
        field('view', $.Identifier),
        optional(field('argumentList', $.ArgumentList)),
        optional(seq('{', repeat(field('children', $.ViewRender)), '}')),
      )
    },

    // Expressions
    ArgumentList($) {
      return seq(
        '(',
        optional(seq(
          choice($.TextLiteral, $.Identifier),
          repeat(seq(',', choice($.TextLiteral, $.Identifier))),
        )),
        ')',
      )
    },
    TextLiteral() {
      return token(seq('"', repeat(choice(/[^"\\\r\n\u0000-\u001f]/, /\\(?:["\\/bfnrt]|u[0-9a-fA-F]{4})/)), '"'))
    },

    // Names
    Identifier() {
      return /[A-Za-z_][A-Za-z0-9_]*/
    },
  },
})
