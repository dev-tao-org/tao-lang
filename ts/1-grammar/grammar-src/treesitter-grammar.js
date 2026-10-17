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
      return seq('view', field('name', $.Identifier), '{', $.RenderStatement, '}')
    },
    RenderStatement($) {
      return seq('render', field('body', $.ViewRender))
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
      return token(seq('"', repeat(choice(/[^"\\\r\n]/, /\\(?:["\\/bfnrt]|u[0-9a-fA-F]{4})/)), '"'))
    },

    // Names
    Identifier() {
      return /[A-Za-z_][A-Za-z0-9_]*/
    },
  },
})
