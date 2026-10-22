import * as AST from '@ast-gen/AST'
import { Tests } from '@shared/os'
import type { LinkedProgram } from '@typecheck/Modules'
import {
  createProjectPipeline,
  type ProjectPipelineServices,
  type ProjectRuntimeOptions,
} from '../workspace-src/ProjectPipeline'
import type { PreparedSidecars } from '../workspace-src/SidecarPipeline'
import type { PreparedManagedModules } from '../workspace-src/sidecars/ManagedModules'

Tests.test('a prepared graph is validated once and reused for later source edits', async () => {
  const events: string[] = []
  const services = fakeServices(events)
  const runtimeOptions: ProjectRuntimeOptions = { watchFolders: ['/base'] }
  const pipeline = createProjectPipeline('/project', '/session', runtimeOptions, services)
  const first = await pipeline.beforeCompile(program('first source', '1.0.0'))
  const second = await pipeline.beforeCompile(program('second source', '1.0.0'))

  Tests.expect(events).toEqual(['input', 'read', 'drift', 'sidecars', 'sidecars'])
  Tests.expect(second.snapshotDirectories).toEqual(first.snapshotDirectories)
  Tests.expect(runtimeOptions.dependencyDirectory).toBe('/profile/node_modules')
  Tests.expect(runtimeOptions.watchFolders).toEqual(['/base', '/profile', '/session/foreign-views'])
  Tests.expect(runtimeOptions.singletonPackages).toEqual([])
})

Tests.test('a changed dependency graph requests preview restart and retains the validated graph', async () => {
  const events: string[] = []
  const pipeline = createProjectPipeline('/project', '/session', {}, fakeServices(events))
  await pipeline.beforeCompile(program('first graph', '1.0.0'))

  await Tests.rejects(
    pipeline.beforeCompile(program('changed graph', '2.0.0')),
    /Dependency graph changed\. Setup and preview restart are required\.(?! A native rebuild)/,
  )
  Tests.expect(events).toEqual(['input', 'read', 'drift', 'sidecars', 'input'])
})

Tests.test('a changed graph with native packages calls out the native rebuild', async () => {
  const pipeline = createProjectPipeline('/project', '/session', {}, fakeServices([], undefined, ['native-addon']))
  await pipeline.beforeCompile(program('first graph', '1.0.0'))

  await Tests.rejects(
    pipeline.beforeCompile(program('changed graph', '2.0.0')),
    /Dependency graph changed\. Setup and preview restart are required\. A native rebuild is also required\./,
  )
})

Tests.test('ordinary source edits do not inspect generated setup files again', async () => {
  const events: string[] = []
  const pipeline = createProjectPipeline('/project', '/session', {}, fakeServices(events, 2))
  await pipeline.beforeCompile(program('first source', '1.0.0'))

  await pipeline.beforeCompile(program('edited source', '1.0.0'))
  Tests.expect(events).toEqual(['input', 'read', 'drift', 'sidecars', 'sidecars'])
})

function fakeServices(
  events: string[],
  driftOnCall?: number,
  nativePackages: string[] = [],
): ProjectPipelineServices {
  let driftCount = 0
  let snapshotCount = 0
  return {
    async buildManagedInput(_root, graph) {
      events.push('input')
      return {
        directory: '/project',
        modules: [{
          directory: '/project',
          requirements: [{ name: 'dep', version: requirementVersion(graph), origin: '/project/main.tao' }],
        }],
        target: 'web',
        runtimePins: {},
        bunVersion: 'test',
      }
    },
    async readManaged() {
      events.push('read')
      return {
        graphFingerprint: 'graph-key',
        fingerprint: 'graph',
        packageDirectory: '/profile',
        lockfile: '/profile/bun.lock',
        nativePackages,
      } satisfies PreparedManagedModules
    },
    async inspectGeneratedFiles() {
      events.push('drift')
      driftCount++
      return driftCount === driftOnCall
        ? [{ path: '/project/tsconfig.json', owner: '/project', repair: 'tao setup --repair' }]
        : []
    },
    async prepareSidecars() {
      events.push('sidecars')
      snapshotCount++
      return {
        fingerprint: `snapshots-${snapshotCount}`,
        resolveForeignViewPath: () => '/session/foreign-views/view.tsx',
        watchDirectories: ['/project/source'],
        snapshotDirectories: ['/session/foreign-views/snapshots'],
      } satisfies PreparedSidecars
    },
  }
}

function program(source: string, requirement: string): LinkedProgram {
  const document = projectDocument(source, requirement)
  return {
    entry: '/project/main.tao',
    modules: [{
      path: '/project/main.tao',
      document,
      bindings: [],
    }],
    definitions: [],
    requirement,
  } as unknown as LinkedProgram
}

function projectDocument(source: string, requirement: string): AST.Document {
  const sourceRange = { start: 0, end: source.length }
  return {
    root: {
      ...sourceRange,
      kind: 'File',
      block: {
        ...sourceRange,
        kind: 'Block',
        statements: [projectView(source), projectRequirement(requirement)],
      },
    },
  }
}

function projectView(source: string): AST.ViewDeclaration {
  const sourceRange = { start: 0, end: source.length }
  return {
    ...sourceRange,
    kind: 'ViewDeclaration',
    name: { kind: 'Name', start: 0, end: 0, value: 'Main' },
    visibility: undefined,
    parameters: [],
    body: {
      ...sourceRange,
      kind: 'Block',
      statements: [{
        ...sourceRange,
        kind: 'RenderInjectStatement',
        injection: { kind: 'Injection', start: 0, end: 0, captures: [], code: '' },
      }],
    },
  }
}

function projectRequirement(version: string): AST.RequiresDeclaration {
  return {
    kind: 'RequiresDeclaration',
    start: 0,
    end: 0,
    provider: 'npm',
    identifier: 'dep',
    version,
    alias: undefined,
  }
}

function requirementVersion(program: LinkedProgram): string {
  return (program as LinkedProgram & { requirement: string }).requirement
}
