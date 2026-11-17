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
