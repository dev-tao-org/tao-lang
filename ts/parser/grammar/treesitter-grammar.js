/// <reference types="tree-sitter-cli/dsl" />

export default grammar({
  name: 'tao',
  extras() {
    return [/\s/]
  },
  rules: {
    source_file($) {
      return repeat(choice($.app_declaration, $.view_declaration))
    },
    app_declaration($) {
      return seq('app', field('name', $.identifier), '{', $.root_declaration, '}')
    },
    root_declaration($) {
      return seq('root', field('view', $.identifier))
    },
    view_declaration($) {
      return seq('view', field('name', $.identifier), '{', $.render_clause, '}')
    },
    render_clause($) {
      return seq('render', field('body', $.container))
    },
    container($) {
      return seq(field('kind', choice('Col', 'Row')), '{', repeat($.text_view), '}')
    },
    text_view($) {
      return seq('Text', '(', field('value', $.string), ')')
    },
    string() {
      return token(seq('"', repeat(choice(/[^"\\\r\n]/, /\\(?:["\\/bfnrt]|u[0-9a-fA-F]{4})/)), '"'))
    },
    identifier() {
      return /[A-Za-z_][A-Za-z0-9_]*/
    },
  },
})
