import { Tests } from '@shared/os'
import { sourceConformanceIssues } from '../cli-checks/source-conformance'

Tests.test('platform imports stay behind the OS boundary across TypeScript import forms', () => {
  const source = [
    "import type { Stats } from 'node:fs'",
    "import fs = require('node:fs')",
    'const sqlite = require(`bun:sqlite`)',
    'const dynamic = import(`node:${moduleName}`)',
    "export * from 'node:future-module'",
  ].join('\n')
  const issues = sourceConformanceIssues('ts/feature.ts', source)
  Tests.expect(issues).toHaveLength(5)
  Tests.expect(issues.every(issue => issue.endsWith('runtime builtin imports belong in @shared/os'))).toBe(true)
  Tests.expect(sourceConformanceIssues('ts/shared/shared-src/os/Feature.ts', source)).toEqual([])
  Tests.expect(sourceConformanceIssues('ts/feature.ts', 'const label = "node:fs"')).toEqual([])
})
