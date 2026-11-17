import { S } from '@shared'
import * as Tests from '@shared-tests'

import { TypeScript } from '@tao/shared/typescript'
import * as SourceConformanceResultContracts from '../repo-analysis-src/Source/source-conformance-result-contracts'

Tests.test('result contract conformance > names concrete return types and preserves generic substitution', () => {
  const source = S`
    function concrete(): string { return '' }
    type Concrete = ReturnType<typeof concrete>
    type Identity<T> = T
    type Generic<T> = ReturnType<Identity<T>>
    type GenericFunction<T> = () => T
    type ConcreteGeneric = ReturnType<GenericFunction<string>>
    namespace Custom {
      type ReturnType<T> = T
      type Shadowed = ReturnType<string>
    }
  `
  Tests.expect(semanticIssuesFor(source)).toEqual([2, 6])
})

Tests.test('result contract conformance > keeps nullish coalescing with its left operand', () => {
  const source = [
    'declare const value: string | undefined',
    'declare const fallback: string',
    'value ?? fallback',
    'value',
    '  ?? fallback',
    '(value',
    '  ?? fallback) ?? fallback',
    'value ??',
    '  fallback',
    'value /* comment */',
    '  ?? fallback',
    'value ??= fallback',
    "'value ?? fallback'",
  ].join('\r\n')
  Tests.expect(nullishIssuesFor(source)).toEqual([4, 6, 10])
})

function semanticIssuesFor(source: string): number[] {
  const { file, checker } = createSemanticFixture(source)
  const issues: number[] = []
  const visit = (node: TypeScript.Node): void => {
    if (SourceConformanceResultContracts.concreteReturnTypeIssue(node, checker)) {
      issues.push(lineOf(node, file))
    }
    TypeScript.forEachChild(node, visit)
  }
  visit(file)
  return issues
}

function nullishIssuesFor(source: string): number[] {
  const file = TypeScript.createSourceFile('/result-contracts.ts', source, TypeScript.ScriptTarget.Latest, true)
  const issues: number[] = []
  const visit = (node: TypeScript.Node): void => {
    if (SourceConformanceResultContracts.ownLineNullishIssue(node, file)) {
      issues.push(lineOf(node, file))
    }
    TypeScript.forEachChild(node, visit)
  }
  visit(file)
  return issues
}

function createSemanticFixture(source: string): { file: TypeScript.SourceFile; checker: TypeScript.TypeChecker } {
  const filename = '/result-contracts.ts'
  const options: TypeScript.CompilerOptions = { strict: true, types: [] }
  const file = TypeScript.createSourceFile(filename, source, TypeScript.ScriptTarget.Latest, true)
  const host = TypeScript.createCompilerHost(options)
  const getSourceFile = host.getSourceFile.bind(host)
  host.getSourceFile = (path, languageVersion, onError, shouldCreateNewSourceFile) =>
    path === filename
      ? file
      : getSourceFile(path, languageVersion, onError, shouldCreateNewSourceFile)
  const program = TypeScript.createProgram([filename], options, host)
  return { file: program.getSourceFile(filename)!, checker: program.getTypeChecker() }
}

function lineOf(node: TypeScript.Node, file: TypeScript.SourceFile): number {
  return file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1
}
