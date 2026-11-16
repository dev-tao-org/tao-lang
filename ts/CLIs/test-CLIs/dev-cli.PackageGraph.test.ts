import { Json, S, Try } from '@shared'
import * as Tests from '@shared-tests'
import { Artifacts, FS, Path } from '@shared/os'
import { analyzePackageGraph, renderPackageGraph } from '../CLIs-src/dev-cli/PackageGraph'

Tests.test('package graph resolves workspace aliases and distinguishes source, type and test imports', async () => {
  const workspace = await Artifacts.mkdtemp(Artifacts.resolvePath('tmp', 'package-graph-'))
  await Try(async () => {
    await writeGraphFixture(workspace)
    const graph = await analyzePackageGraph(workspace)
    Tests.expect(graph.packages.map(pkg => pkg.name)).toEqual(['@tao/consumer', '@tao/core', '@tao/test-tool'])
    Tests.expect(graph.imports).toEqual([
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
        from: { package: '@tao/consumer', file: 'consumer/test-consumer/Source.test.ts' },
        to: { package: '@tao/test-tool', file: 'team/test-tool/TestTool.ts' },
        specifier: '../../team/test-tool/TestTool',
        kind: 'value',
        scope: 'test',
      },
    ])
    Tests.expect(graph.unresolved.map(dependency => dependency.specifier)).toEqual(['./Missing'])
    const report = renderPackageGraph(graph)
    Tests.expect(report).toContain('p1 -->|1 value, 1 type| p2')
    Tests.expect(report.split('## Test imports')[1]).toContain('p1 -->|1 value| p3')
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
  await FS.writeFile(Path.join(workspace, 'team/core/Value.ts'), 'export const value = 1')
  await FS.writeFile(Path.join(workspace, 'team/test-tool/TestTool.ts'), 'export const testTool = 1')
  await FS.writeFile(
    Path.join(workspace, 'consumer/Source.ts'),
    S`
      import type { Thing } from '@ast-gen'
      import { value } from '@shared'
      import './Missing'
      export const result: Thing = value
    `,
  )
  await FS.mkdir(Path.join(workspace, 'consumer/test-consumer'))
  await FS.writeFile(
    Path.join(workspace, 'consumer/test-consumer/Source.test.ts'),
    "export { testTool } from '../../team/test-tool/TestTool'",
  )
}

async function writeJson(workspace: string, file: string, value: unknown): Promise<void> {
  const path = Path.join(workspace, file)
  await FS.mkdir(Path.dirname(path))
  await FS.writeFile(path, Json.Print(value))
}
