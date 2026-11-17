import type { FormattingHandlers } from '../lib/formatter/Formatter'

/** Formatting defines Tao horizontal spacing and opaque embedded content. */
export const Formatting = {
  TypeScriptLibraryDeclaration(fm) {
    fm.oneSpaceAfter('ts-library')
  },
  PublishDeclaration(fm) {
    fm.oneSpaceAround('{', '}')
    fm.commaSpacedList()
  },
  AppDeclaration(fm) {
    fm.oneSpaceAfter('app')
  },
  RootDeclaration(fm) {
    fm.oneSpaceAfter('root')
  },
  ViewDeclaration(fm) {
    fm.oneSpaceAfter('view')
    fm.noSpaceBeforeProperty('parameters')
  },
  Block(fm) {
    fm.oneSpaceBefore('{')
  },
  ViewRenderExpression(fm) {
    fm.noSpaceBeforeProperty('argumentList')
  },
  LetDeclaration(fm) {
    fm.oneSpaceAfter('let')
    fm.oneSpaceAround('=', 'is')
  },
  StateDeclaration(fm) {
    fm.oneSpaceAfter('state')
    fm.oneSpaceAround('=', 'is')
  },
  ActionDeclaration(fm) {
    fm.oneSpaceAfter('action')
    fm.noSpaceBeforeProperty('parameters')
  },
  FunctionDeclaration(fm) {
    fm.oneSpaceAfter('func')
    fm.oneSpaceAround('->')
    fm.noSpaceBeforeProperty('parameters')
  },
  FunctionCall(fm) {
    fm.noSpaceBeforeProperty('argumentList')
  },
  FunctionArgumentList(fm) {
    fm.commaSpacedList()
  },
  FunctionArgument(fm) {
    fm.noSpaceBefore(':')
    fm.oneSpaceAfter(':')
  },
  ReturnStatement(fm) {
    fm.oneSpaceAfter('return')
  },
  SetStatement(fm) {
    fm.oneSpaceAfter('set')
    fm.oneSpaceAround('=')
  },
  DoStatement(fm) {
    fm.oneSpaceAfter('do')
    fm.noSpaceBeforeProperty('argumentList')
  },
  PressBinding(fm) {
    fm.oneSpaceAfter('on', 'press')
  },
  InlineAction(fm) {
    fm.oneSpaceAfter('->')
  },
  RenderInjectStatement(fm) {
    fm.oneSpaceAfter('render')
  },
  RenderViewExpressionStatement(fm) {
    fm.oneSpaceAfter('render')
  },
  Parameter(fm) {
    fm.oneSpaceBeforeProperty('type')
  },
  InjectionCapture(fm) {
    fm.oneSpaceBeforeProperty('value')
  },
  QualifiedName(fm) {
    fm.noSpaceAround('.')
  },
  InterpolatedText(fm) {
    fm.noSpaceAroundProperty('parts')
  },
  TextInterpolation(fm) {
    fm.oneSpaceAfter('{')
    fm.oneSpaceBefore('}')
  },
  ParameterList(fm) {
    fm.commaSpacedList()
  },
  ArgumentList(fm) {
    fm.commaSpacedList()
  },
  Injection(fm) {
    fm.oneSpaceAfter('inject')
    fm.commaSpacedList()
    fm.oneSpaceBeforeProperty('code')
    fm.preserveProperty('code')
  },
  UseStatement(fm) {
    fm.oneSpaceAfter('use')
    fm.oneSpaceBeforeProperty('imports')
    fm.commaSpacedList()
  },
  RequiresDeclaration(fm) {
    fm.oneSpaceAfter('requires')
    fm.noSpaceAround(':')
    fm.oneSpaceAround('version', 'as')
  },
  NamedImport(fm) {
    fm.oneSpaceAround('as')
  },
  TestsDeclaration(fm) {
    fm.oneSpaceAfter('tests')
  },
  TestDeclaration(fm) {
    fm.noSpaceBefore('(')
    fm.commaSpacedList()
  },
  RunStatement(fm) {
    fm.oneSpaceAfter('run')
  },
  PressStatement(fm) {
    fm.oneSpaceAfter('press')
  },
  TypeStatement(fm) {
    fm.oneSpaceAfter('type')
    fm.oneSpaceAround('into')
  },
  ExpectStatement(fm) {
    fm.oneSpaceAfter('expect')
  },
  TextExpectation(fm) {
    fm.oneSpaceAfter('text')
  },
  InputExpectation(fm) {
    fm.oneSpaceAround('input')
    fm.oneSpaceAfter('value')
  },
  InputValueExpectation(fm) {
    fm.oneSpaceAfter('input', 'value')
  },
} satisfies FormattingHandlers
