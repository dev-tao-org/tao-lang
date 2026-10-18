import type { FormattingHandlers } from '../lib/formatter/Formatter'

/** Formatting defines Tao horizontal spacing and opaque embedded content. */
export const Formatting = {
  AppDeclaration(fm) {
    fm.oneSpaceAfter('app').oneSpaceBefore('{')
  },
  RootDeclaration(fm) {
    fm.oneSpaceAfter('root')
  },
  ViewDeclaration(fm) {
    fm.oneSpaceAfter('view').noSpaceBeforeProperty('parameters').oneSpaceBefore('{')
  },
  ViewRender(fm) {
    fm.noSpaceBeforeProperty('argumentList').oneSpaceBefore('{')
  },
  LetDefinition(fm) {
    fm.oneSpaceAfter('let').oneSpaceAround('=', 'is')
  },
  RenderStatement(fm) {
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
    fm.oneSpaceAfter('inject').commaSpacedList().oneSpaceBeforeProperty('code').preserveProperty('code')
  },
  UseStatement(fm) {
    fm.oneSpaceAfter('use').oneSpaceAround('from').commaSpacedList()
  },
  UsePackageStatement(fm) {
    fm.oneSpaceAfter('use', 'package').oneSpaceAround('as')
  },
  NamedImport(fm) {
    fm.oneSpaceAround('as')
  },
  TestsDeclaration(fm) {
    fm.oneSpaceAfter('tests').oneSpaceBefore('{')
  },
  TestDeclaration(fm) {
    fm.noSpaceBefore('(').commaSpacedList().oneSpaceBefore('{')
  },
  RunStatement(fm) {
    fm.oneSpaceAfter('run')
  },
  PressStatement(fm) {
    fm.oneSpaceAfter('press')
  },
  TypeStatement(fm) {
    fm.oneSpaceAfter('type').oneSpaceAround('into')
  },
  ExpectStatement(fm) {
    fm.oneSpaceAfter('expect').oneSpaceBefore('{')
  },
  TextExpectation(fm) {
    fm.oneSpaceAfter('text')
  },
  InputExpectation(fm) {
    fm.oneSpaceAround('input').oneSpaceAfter('value')
  },
  InputValueExpectation(fm) {
    fm.oneSpaceAfter('input', 'value')
  },
} satisfies FormattingHandlers
