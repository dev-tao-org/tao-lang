import type { FormattingHandlers } from '../lib/formatter/Formatter'

/** Formatting defines Tao horizontal spacing and opaque embedded content. */
export const Formatting = {
  AppDeclaration(fm) {
    fm.oneSpaceAfter('app').oneSpaceBefore('{')
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
    fm.commaSpacedList()
  },
  TestDeclaration(fm) {
    fm.noSpaceBefore('(').commaSpacedList().oneSpaceBefore('{')
  },
} satisfies FormattingHandlers
