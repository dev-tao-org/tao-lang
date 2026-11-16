import * as Tests from '@shared-tests'
import { Repo } from '@shared/os'
import { TypeScript } from '../../shared/shared-src/bridges/Bridge_typescript'
import { createSourceBridgeContext } from '../repo-analysis-src/Source/source-bridge-owners'
import { sourceBridgeIssue, sourceBridgeLoaderAliases } from '../repo-analysis-src/Source/source-bridges'
import { createFixtureProgram } from './Source.test-fixtures'

const bridgeContext = createSourceBridgeContext(Repo.getWorkspaceRoot())

Tests.test('source conformance > assigns external module references to exact bridge owners', () => {
  expectBridgeIssue(
    "import fs from 'node:fs'",
    'ts/app.ts',
    'external module "node:fs" belongs in ts/shared/shared-src/os/bridges/Bridge_node',
  )
  expectBridgeIssue("import fs from 'node:fs'", 'ts/shared/shared-src/os/bridges/Bridge_node/Bridge_node.ts')
  expectBridgeIssue(
    "import { x } from '@expo/metro/runtime'",
    'ts/app.ts',
    'external module "@expo/metro/runtime" belongs in ts/7-runtime/runtime-src/bridges/Bridge_expo-metro',
  )
  expectBridgeIssue(
    "import { x } from 'unknown-package'",
    'ts/app.ts',
    'external module "unknown-package" has no registered bridge owner',
  )
  expectBridgeIssue("import { x } from '@shared'", 'ts/app.ts')
  expectBridgeIssue("import { x } from '@cli-kit'", 'ts/app.ts')
  expectBridgeIssue("import { x } from '@cst'", 'ts/app.ts')
  expectBridgeIssue("import { x } from '@grammar'", 'ts/app.ts')
  expectBridgeIssue("import Tao from '@tao/runtime-api'", 'ts/app.ts')
  expectBridgeIssue("import { x } from '@tao/runtime/Runtime'", 'ts/app.ts')
  expectBridgeIssue(
    "import { x } from '@tao/not-a-workspace-package'",
    'ts/app.ts',
    'external module "@tao/not-a-workspace-package" has no registered bridge owner',
  )
  expectBridgeIssue("import { x } from './local'", 'ts/app.ts')
})

Tests.test('source conformance > checks type, re-export, dynamic, require and wrapped module literals', () => {
  const cases = [
    { source: "type Stats = import('node:fs').Stats", specifier: 'node:fs', owner: 'node' },
    { source: "export { readFile } from 'node:fs/promises'", specifier: 'node:fs/promises', owner: 'node' },
    { source: "const fs = await import('node:fs/promises')", specifier: 'node:fs/promises', owner: 'node' },
    { source: "const fs = require('node:fs')", specifier: 'node:fs', owner: 'node' },
    { source: "const fs = require.resolve('node:fs')", specifier: 'node:fs', owner: 'node' },
    { source: "const parser = Platform.loadModule('tree-sitter')", specifier: 'tree-sitter', owner: 'tree-sitter' },
  ]
  for (const { source, specifier, owner } of cases) {
    const ownerPath = owner === 'node'
      ? 'ts/shared/shared-src/os/bridges/Bridge_node'
      : 'ts/1-grammar/grammar-src/bridges/Bridge_tree-sitter.ts'
    expectBridgeIssue(source, 'ts/app.ts', `external module "${specifier}" belongs in ${ownerPath}`)
  }
  expectBridgeIssue("const text = 'node:fs'; // require('node:path')", 'ts/app.ts')
})

Tests.test('source conformance > retains only the three exact builtin mock fixture exceptions', () => {
  expectBridgeIssue(
    "const fs = await import('node:fs/promises')",
    'ts/shared/test-shared/os/FS.Files.GeneratedMetadata.test.ts',
  )
  expectBridgeIssue(
    "const fs = await import('node:fs/promises')",
    'ts/shared/test-shared/os/Storage.LeaseFailures.test.ts',
  )
  expectBridgeIssue(
    "const fs = await import('node:fs/promises')",
    'ts/shared/test-shared/os/locks.FileLock.PointerDiagnostics.test.ts',
  )
  expectBridgeIssue(
    "const fs = await import('node:fs')",
    'ts/shared/test-shared/os/FS.Files.GeneratedMetadata.test.ts',
    'external module "node:fs" belongs in ts/shared/shared-src/os/bridges/Bridge_node',
  )
  expectBridgeIssue(
    "import fs from 'node:fs/promises'",
    'ts/shared/test-shared/os/FS.Files.GeneratedMetadata.test.ts',
    'external module "node:fs/promises" belongs in ts/shared/shared-src/os/bridges/Bridge_node',
  )
  expectBridgeIssue(
    "type Stats = import('node:fs/promises').Stats",
    'ts/shared/test-shared/os/FS.Files.GeneratedMetadata.test.ts',
    'external module "node:fs/promises" belongs in ts/shared/shared-src/os/bridges/Bridge_node',
  )
  expectBridgeIssue(
    "export { readFile } from 'node:fs/promises'",
    'ts/shared/test-shared/os/FS.Files.GeneratedMetadata.test.ts',
    'external module "node:fs/promises" belongs in ts/shared/shared-src/os/bridges/Bridge_node',
  )
  expectBridgeIssue(
    "const fs = require('node:fs/promises')",
    'ts/shared/test-shared/os/FS.Files.GeneratedMetadata.test.ts',
    'external module "node:fs/promises" belongs in ts/shared/shared-src/os/bridges/Bridge_node',
  )
})

Tests.test('source conformance > enforces known template module families without guessing dynamic targets', () => {
  expectBridgeIssue(
    'const module = import(`node:${name}`)',
    'ts/app.ts',
    'external module "node" belongs in ts/shared/shared-src/os/bridges/Bridge_node',
  )
  expectBridgeIssue(
    'const module = require(`bun:${name}`)',
    'ts/app.ts',
    'external module "bun" belongs in ts/shared/shared-src/os/bridges/Bridge_bun',
  )
  expectBridgeIssue('import(`node:${name}`)', 'ts/shared/shared-src/os/bridges/Bridge_node/Bridge_node.ts')
  expectBridgeIssue('require(`bun:${name}`)', 'ts/shared/shared-src/os/bridges/Bridge_bun/Bridge_bun.ts')
  expectBridgeIssue('function inspect(require: any) { require(`node:${name}`) }', 'ts/app.ts')
  expectBridgeIssue('inspect(`node:${name}`)', 'ts/app.ts')
  expectBridgeIssue('import(`${family}:${name}`)', 'ts/app.ts')
  expectBridgeIssue(
    'import(`node:fs/promises${suffix}`)',
    'ts/shared/test-shared/os/FS.Files.GeneratedMetadata.test.ts',
    'external module "node" belongs in ts/shared/shared-src/os/bridges/Bridge_node',
  )
})

Tests.test('source conformance > recognizes literal calls through loader aliases', () => {
  const sources = [
    "const load = require; load('node:fs')",
    "const requireHere = createRequire(import.meta.url); requireHere('node:fs')",
    "const requireHere = Node.createRequire(import.meta.url); const load = requireHere; load('node:fs')",
    "const load = Bridge.createMetroLoader(directory); load('node:fs')",
    "createExpoCliLoader(directory).resolve('node:fs')",
    "createExpoLoader(directory)('node:fs')",
  ]
  for (const source of sources) {
    expectBridgeIssue(
      source,
      'ts/app.ts',
      'external module "node:fs" belongs in ts/shared/shared-src/os/bridges/Bridge_node',
    )
  }
})

Tests.test('source conformance > resolves loader aliases by binding across lexical scopes', () => {
  expectBridgeIssue(
    "const load = require; function inspect(load: (label: string) => void) { load('react') }",
    'ts/app.ts',
  )
  expectBridgeIssue("function inspect(require: (label: string) => void) { require('react') }", 'ts/app.ts')
  expectBridgeIssue(
    "const load = require; function inspect(load: (label: string) => void) { load('label') }; load('react')",
    'ts/app.ts',
    'external module "react" belongs in ts/7-runtime/runtime-src/client/Bridge_react',
  )
})

Tests.test('source conformance > respects shadowed factory and platform namespace bindings', () => {
  const sources = [
    "function inspect(createRequire: () => (label: string) => void) { const load = createRequire(); load('react') }",
    "function inspect(Node: { createRequire(): (label: string) => void }) { const load = Node.createRequire(); load('react') }",
    "function inspect(Platform: { loadModule(label: string): void }) { Platform.loadModule('react') }",
    "function inspect(Platform: { loadModule(label: string): void }) { const load = Platform.loadModule; load('react') }",
    "function inspect(Node: any) { const load = Node.createRequire(); load('react') }",
  ]
  for (const source of sources) {
    expectBridgeIssue(source, 'ts/app.ts')
  }
})

Tests.test('source conformance > recognizes resolved owner factories while ignoring local namespace parameters', () => {
  const filename = '/fixture/consumer.ts'
  const declarations = '/fixture/node_modules/@types/node/module.d.ts'
  const sources = new Map([
    [
      filename,
      "const load = Node.createRequire(''); load('react'); function inspect(Node: any) { const load = Node.createRequire(); load('react') }",
    ],
    [declarations, 'declare namespace Node { function createRequire(path: string): (name: string) => unknown }'],
  ])
  const program = createFixtureProgram(sources)
  Tests.expect(findBridgeIssues(program.getSourceFile(filename)!, 'ts/app.ts', program.getTypeChecker())).toEqual([
    'external module "react" belongs in ts/7-runtime/runtime-src/client/Bridge_react',
  ])
})

function expectBridgeIssue(source: string, filename: string, expected?: string): void {
  const file = TypeScript.createSourceFile(filename, source, TypeScript.ScriptTarget.Latest, true)
  Tests.expect(findBridgeIssues(file, filename)).toEqual(expected === undefined ? [] : [expected])
}

function findBridgeIssues(file: TypeScript.SourceFile, filename: string, checker?: TypeScript.TypeChecker): string[] {
  const loaderAliases = sourceBridgeLoaderAliases(file, checker)
  const issues: string[] = []
  const visit = (node: TypeScript.Node): void => {
    const issue = sourceBridgeIssue(node, filename, bridgeContext, loaderAliases, false)
    if (issue) {
      issues.push(issue)
    }
    TypeScript.forEachChild(node, visit)
  }
  visit(file)
  return issues
}
