import * as Tests from '@shared-tests'
import { Repo } from '@shared/os'
import { TypeScript } from '../../shared/shared-src/bridges/Bridge_typescript'
import { sourceBridgeEmissionIssues } from '../repo-analysis-src/Source/source-bridge-emissions'
import { createSourceBridgeContext } from '../repo-analysis-src/Source/source-bridge-owners'

Tests.test('source conformance > requires generated imports to remain source-owned', () => {
  const source = 'const code = S`import fs from "node:fs"; require("expo/metro-config")`'
  Tests.expect(findEmissionIssues(source, 'ts/app.ts')).toEqual([
    'emitted source: external module "node:fs" belongs in ts/shared/shared-src/os/bridges/Bridge_node',
    'emitted source: external module "expo/metro-config" belongs in ts/7-runtime/runtime-src/bridges/Bridge_expo',
  ])
  Tests.expect(findEmissionIssues(
    'const code = S`const fs = require("node:fs")`',
    'ts/shared/shared-src/os/bridges/Bridge_node/Bridge_node-emission.ts',
  )).toEqual([])
  Tests.expect(findEmissionIssues('const code = S`export * from "react"`', 'ts/app.ts')).toEqual([
    'emitted source: external module "react" belongs in ts/7-runtime/runtime-src/client/Bridge_react',
  ])
  Tests.expect(findEmissionIssues(
    'const code = S`export * from "react"`',
    'ts/7-runtime/runtime-src/client/Bridge_react/Bridge_react.ts',
  )).toEqual([])
})

Tests.test('source conformance > follows createRequire destructured from a literal Node module import', () => {
  const source =
    'const code = S`const { createRequire } = require("node:module"); const load = createRequire("/tmp/app/package.json"); load("react")`'
  Tests.expect(findEmissionIssues(source, 'ts/shared/shared-src/os/bridges/Bridge_node/Bridge_node-emission.ts'))
    .toEqual([
      'emitted source: external module "react" belongs in ts/7-runtime/runtime-src/client/Bridge_react',
    ])
})

Tests.test('source conformance > limits isolated external probes to exact source specifiers', () => {
  const fixture = 'ts/shared/test-shared/os/FS.GeneratedFileSystem.test.ts'
  Tests.expect(findEmissionIssues('const code = S`require("node:fs")`', fixture)).toEqual([])
  Tests.expect(findEmissionIssues('const code = S`require("node:crypto")`', fixture)).toHaveLength(1)
  Tests.expect(findEmissionIssues('const label = "node:fs"', 'ts/app.ts')).toEqual([])
})

function findEmissionIssues(source: string, filename: string): string[] {
  const file = TypeScript.createSourceFile(filename, source, TypeScript.ScriptTarget.Latest, true)
  const context = createSourceBridgeContext(Repo.getWorkspaceRoot())
  const issues: string[] = []
  const visit = (node: TypeScript.Node): void => {
    issues.push(...sourceBridgeEmissionIssues(node, filename, context))
    TypeScript.forEachChild(node, visit)
  }
  visit(file)
  return issues
}
