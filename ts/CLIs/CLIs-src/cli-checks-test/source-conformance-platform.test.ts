import { Tests } from '@shared/os'
import * as TypeScript from 'typescript'
import { platformAccessIssue } from '../cli-checks/source-conformance-platform'

Tests.test('platform conformance > routes builtin module references through one OS owner', () => {
  for (
    const source of [
      "import fs from 'node:fs'",
      "export { readFile } from 'fs/promises'",
      "const fs = await import('node:fs/promises')",
      "const fs = require('fs')",
      "type Stats = import('node:fs').Stats",
    ]
  ) {
    Tests.expect(findPlatformIssue(source, 'ts/app.ts')).toBe('runtime builtin imports belong in @shared/os')
  }
  Tests.expect(findPlatformIssue("import fs from 'node:fs'", 'ts/shared/shared-src/os/NodeBuiltins.ts'))
    .toBeUndefined()
  Tests.expect(findPlatformIssue("import fs from 'fs'", 'ts/shared/shared-src/os/NodeBuiltins.ts')).toBeUndefined()
  Tests.expect(
    findPlatformIssue(
      "import { pathToFileURL } from 'node:url'",
      'ts/shared/shared-src/os/Bootstrap-test/Bootstrap.test.ts',
    ),
  ).toBe('runtime builtin imports belong in @shared/os')
  Tests.expect(
    findPlatformIssue("import { tmpdir } from 'node:os'", 'ts/shared/shared-src/os/Storage-test/Storage.test.ts'),
  ).toBe('runtime builtin imports belong in @shared/os')
  Tests.expect(findPlatformIssue("import fs from 'node:fs'", 'ts/shared/shared-src/os/Storage-test/Storage.test.ts'))
    .toBe('runtime builtin imports belong in @shared/os')
  Tests.expect(findPlatformIssue(
    "const fs = await import('node:fs/promises')",
    'ts/shared/shared-src/os/Files-test/GeneratedMetadata.test.ts',
  )).toBeUndefined()
  Tests.expect(findPlatformIssue(
    "const path = await import('node:path')",
    'ts/shared/shared-src/os/Files-test/GeneratedMetadata.test.ts',
  )).toBe('runtime builtin imports belong in @shared/os')
})

type PlatformIssue = string | undefined

Tests.test('platform conformance > centralizes process environment access even inside the OS package', () => {
  const message = 'process environment access belongs in Env; use readonly values or subprocess addEnv overrides'
  for (const source of ['process.env.HOME', 'process["env"]["HOME"]', 'globalThis.process.env.HOME']) {
    Tests.expect(findPlatformIssue(source, 'ts/shared/shared-src/os/Other.ts')).toBe(message)
    Tests.expect(findPlatformIssue(source, 'ts/shared/shared-src/os/Env.ts')).toBeUndefined()
  }
  Tests.expect(findPlatformIssue('Env.get("HOME")', 'ts/shared/shared-src/os/Other.ts')).toBeUndefined()
  Tests.expect(findPlatformIssue('const text = "process.env.HOME"', 'ts/shared/shared-src/os/Other.ts'))
    .toBeUndefined()
})

function findPlatformIssue(source: string, filename: string): string | undefined {
  const file = TypeScript.createSourceFile(filename, source, TypeScript.ScriptTarget.Latest, true)
  let issue: PlatformIssue
  const visit = (node: TypeScript.Node): void => {
    issue ??= platformAccessIssue(node, filename)
    TypeScript.forEachChild(node, visit)
  }
  visit(file)
  return issue
}
