import { S, Try } from '@shared'
import * as Tests from '@shared-tests'
import { Artifacts, FS, Path } from '@shared/os'
import { analyzePackageGraph, renderPackageGraph } from '../CLIs-src/dev-cli/PackageGraph'

const ExpectedImports = [
  {
    from: { package: '@tao/consumer', file: 'consumer/DynamicFirst.ts' },
    to: { package: '@tao/core', file: 'team/core/Value.ts' },
    specifier: '@shared',
    kind: 'value',
    scope: 'source',
  },
  {
    from: { package: '@tao/consumer', file: 'consumer/DynamicFirst.ts' },
    to: { package: '@tao/core', file: 'team/core/Value.ts' },
    specifier: '@shared',
    kind: 'type',
    scope: 'source',
  },
  {
    from: { package: '@tao/consumer', file: 'consumer/Erased.ts' },
    to: { package: '@tao/core', file: 'team/core/Value.ts' },
    specifier: '@shared',
    kind: 'compile-only',
    scope: 'source',
  },
  {
    from: { package: '@tao/consumer', file: 'consumer/Mixed.ts' },
    to: { package: '@tao/core', file: 'team/core/Value.ts' },
    specifier: '@shared',
    kind: 'value',
    scope: 'source',
  },
  {
    from: { package: '@tao/consumer', file: 'consumer/Source.ts' },
    to: { package: '@tao/core', file: 'team/core/Types.ts' },
    specifier: '@ast-gen',
    kind: 'type',
    scope: 'source',
  },
  {
    from: { package: '@tao/consumer', file: 'consumer/Source.ts' },
    to: { package: '@tao/core', file: 'team/core/Value.ts' },
    specifier: '@shared',
    kind: 'value',
    scope: 'source',
  },
  {
    from: { package: '@tao/consumer', file: 'consumer/Source.ts' },
    to: { package: '@tao/core', file: 'team/core/Value.ts' },
    specifier: '@shared',
    kind: 'type',
    scope: 'source',
  },
  {
    from: { package: '@tao/consumer', file: 'consumer/StaticAndDynamic.ts' },
    to: { package: '@tao/core', file: 'team/core/Value.ts' },
    specifier: '@shared',
    kind: 'value',
    scope: 'source',
  },
  {
    from: { package: '@tao/consumer', file: 'consumer/StaticAndDynamic.ts' },
    to: { package: '@tao/core', file: 'team/core/Value.ts' },
    specifier: '@shared',
    kind: 'compile-only',
    scope: 'source',
  },
  {
    from: { package: '@tao/consumer', file: 'consumer/StaticInlineAndDynamic.ts' },
    to: { package: '@tao/core', file: 'team/core/Value.ts' },
    specifier: '@shared',
    kind: 'value',
    scope: 'source',
  },
  {
    from: { package: '@tao/consumer', file: 'consumer/StaticInlineAndDynamic.ts' },
    to: { package: '@tao/core', file: 'team/core/Value.ts' },
    specifier: '@shared',
    kind: 'type',
    scope: 'source',
  },
  {
    from: { package: '@tao/consumer', file: 'consumer/StaticInlineAndDynamic.ts' },
    to: { package: '@tao/core', file: 'team/core/Value.ts' },
    specifier: '@shared',
    kind: 'compile-only',
    scope: 'source',
  },
  {
    from: { package: '@tao/consumer', file: 'consumer/TypeFirst.ts' },
    to: { package: '@tao/core', file: 'team/core/Value.ts' },
    specifier: '@shared',
    kind: 'value',
    scope: 'source',
  },
  {
    from: { package: '@tao/consumer', file: 'consumer/TypeFirst.ts' },
    to: { package: '@tao/core', file: 'team/core/Value.ts' },
    specifier: '@shared',
    kind: 'type',
    scope: 'source',
  },
  {
    from: { package: '@tao/consumer', file: 'consumer/test-consumer/Source.test.ts' },
    to: { package: '@tao/test-tool', file: 'team/test-tool/TestTool.ts' },
    specifier: '../../team/test-tool/TestTool',
    kind: 'value',
    scope: 'test',
  },
] as const

Tests.test('package graph resolves workspace aliases and distinguishes source, type and test imports', async () => {
  const workspace = await Artifacts.mkdtemp(Artifacts.resolvePath('tmp', 'package-graph-'))
  await Try(async () => {
    await writeGraphFixture(workspace)
    const graph = await analyzePackageGraph(workspace)
    Tests.expect(graph.packages.map(pkg => pkg.name)).toEqual(['@tao/consumer', '@tao/core', '@tao/test-tool'])
    Tests.expect(graph.imports).toEqual([...ExpectedImports])
    Tests.expect(graph.unresolved.map(dependency => dependency.specifier)).toEqual(['./Missing'])
    const report = renderPackageGraph(graph)
    Tests.expect(report).toContain('p1 -->|6 value, 5 type, 3 compile-only| p2')
    Tests.expect(report.split('## Test imports')[1]).toContain('p1 -->|1 value| p3')
  }, { finally: () => FS.rm(workspace, { recursive: true, force: true }) })
})

Tests.test('package graph preserves inline types and emitted default imports', async () => {
  const workspace = await Artifacts.mkdtemp(Artifacts.resolvePath('tmp', 'package-inline-'))
  await Try(async () => {
    await writeGraphFixture(workspace)
    const inline = "export type Inline = import('@shared').Input"
    const combined = S`
      import compute from '@shared'
      export const result = compute(1)
      ${inline}
    `
    const emptyList = S`
      import compute, {} from '@shared'
      export const result = compute(1)
    `
    const importEquals = S`
      import Equal = require('@shared')
      export type EqualType = typeof Equal
      export const load = () => import('@shared')
    `
    await FS.writeFile(Path.join(workspace, 'consumer/Inline.tsc.ts'), inline)
    await FS.writeFile(Path.join(workspace, 'consumer/Combined.tsc.ts'), combined)
    await FS.writeFile(Path.join(workspace, 'consumer/EmptyList.tsc.ts'), emptyList)
    await FS.writeFile(Path.join(workspace, 'consumer/ImportEquals.tsc.ts'), importEquals)
    const graph = await analyzePackageGraph(workspace)
    const kinds = (file: string) => graph.imports.filter(edge => edge.from.file === file).map(edge => edge.kind)
    Tests.expect(kinds('consumer/Inline.tsc.ts')).toEqual(['type'])
    Tests.expect(kinds('consumer/Combined.tsc.ts')).toEqual(['value', 'type'])
    Tests.expect(kinds('consumer/EmptyList.tsc.ts')).toEqual(['value'])
    Tests.expect(kinds('consumer/ImportEquals.tsc.ts').sort()).toEqual(['compile-only', 'value'])
  }, { finally: () => FS.rm(workspace, { recursive: true, force: true }) })
})

Tests.test('workspace package globs cannot search outside the requested root', async () => {
  const workspace = await Artifacts.mkdtemp(Artifacts.resolvePath('tmp', 'outside-workspace-'))
  await Try(async () => {
    for (const pattern of ['../external/*', '/external/*', 'C:\\external\\*']) {
      await writeJson(workspace, 'package.json', { workspaces: [pattern] })
      await Tests.expect(analyzePackageGraph(workspace)).rejects.toThrow('Workspace package globs must stay inside ts/')
    }
  }, { finally: () => FS.rm(workspace, { recursive: true, force: true }) })
})

async function writeGraphFixture(workspace: string): Promise<void> {
  await writeJson(workspace, 'package.json', { workspaces: ['team/*', 'consumer'] })
  await writeJson(workspace, 'tsconfig.base.json', {
    compilerOptions: {
      paths: { '@ast-gen': ['./team/core/Types.ts'], '@shared': ['./team/core/Value.ts'] },
    },
  })
  await writeJson(workspace, 'consumer/package.json', { name: '@tao/consumer' })
  await writeJson(workspace, 'team/core/package.json', { name: '@tao/core' })
  await writeJson(workspace, 'team/test-tool/package.json', { name: '@tao/test-tool' })
  await writeJson(workspace, 'unused/package.json', { name: '@tao/unused' })
  await FS.writeFile(Path.join(workspace, 'team/core/Types.ts'), 'export type Thing = number')
  await FS.writeFile(
    Path.join(workspace, 'team/core/Value.ts'),
    S`
      export default function compute(value: number) { return value }
      export type Input = number
      export type Result = number
    `,
  )
  await FS.writeFile(Path.join(workspace, 'team/test-tool/TestTool.ts'), 'export const testTool = 1')
  await writeConsumerSources(workspace)
  await writeErasedStaticSources(workspace)
}

async function writeConsumerSources(workspace: string): Promise<void> {
  await FS.writeFile(
    Path.join(workspace, 'consumer/DynamicFirst.ts'),
    S`
      export const load = () => import('@shared')
      export type Input = import('@shared').Input
    `,
  )
  await FS.writeFile(
    Path.join(workspace, 'consumer/Erased.ts'),
    S`
      import compute, { type Input } from '@shared'
      export type Compute = [typeof compute, Input]
    `,
  )
  await FS.writeFile(
    Path.join(workspace, 'consumer/Mixed.ts'),
    S`
      import compute, { type Input } from '@shared'
      export const result = compute(1 as Input)
    `,
  )
  await FS.writeFile(
    Path.join(workspace, 'consumer/TypeFirst.ts'),
    S`
      export type Input = import('@shared').Input
      export const load = () => import('@shared')
    `,
  )
  await FS.writeFile(
    Path.join(workspace, 'consumer/Source.ts'),
    S`
      import type { Thing } from '@ast-gen'
      import compute, { type Input } from '@shared'
      import type { Result } from '@shared'
      import './Missing'
      export const result: Thing | Result = compute(1 as Input)
    `,
  )
  await FS.mkdir(Path.join(workspace, 'consumer/test-consumer'))
  await FS.writeFile(
    Path.join(workspace, 'consumer/test-consumer/Source.test.ts'),
    "export { testTool } from '../../team/test-tool/TestTool'",
  )
}

async function writeErasedStaticSources(workspace: string): Promise<void> {
  await FS.writeFile(
    Path.join(workspace, 'consumer/StaticAndDynamic.ts'),
    S`
      import { Input } from '@shared'
      export type Shape = Input
      export const load = () => import('@shared')
    `,
  )
  await FS.writeFile(
    Path.join(workspace, 'consumer/StaticInlineAndDynamic.ts'),
    S`
      import { Input } from '@shared'
      export type Shape = [Input, import('@shared').Result]
      export const load = () => import('@shared')
    `,
  )
}

async function writeJson(workspace: string, file: string, value: unknown): Promise<void> {
  const path = Path.join(workspace, file)
  await FS.mkdir(Path.dirname(path))
  await FS.writeJson(path, value)
}
