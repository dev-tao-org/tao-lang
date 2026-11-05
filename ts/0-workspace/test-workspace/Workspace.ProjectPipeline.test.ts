import * as AST from '@ast-gen'
import { Range } from '@shared'
import * as Tests from '@shared-tests'

import type * as Typecheck from '@typecheck'

import * as ProjectPipeline from '../workspace-src/ProjectPipeline'
import type { PreparedSidecars } from '../workspace-src/SidecarPipeline'
import type * as ManagedModules from '../workspace-src/sidecars/ManagedModule/ManagedModules'

const RestartRequiredWithoutNativeRebuildRegx =
  /Dependency graph changed\. Setup and preview restart are required\.(?! A native rebuild)/
const RestartRequiredWithNativeRebuildRegx =
  /Dependency graph changed\. Setup and preview restart are required\. A native rebuild is also required\./

Tests.test('a prepared graph is validated once and reused for later source edits', async () => {
  const events: string[] = []
  const services = fakeServices(events, undefined, ['native-addon'], ['declared-singleton'])
  const runtimeOptions: ProjectPipeline.ProjectRuntimeOptions = { watchFolders: ['/base'] }
  const pipeline = ProjectPipeline.createProjectPipeline('/project', '/session', runtimeOptions, services)
  const first = await pipeline.beforeCompile(program('first source', '1.0.0'))
  const second = await pipeline.beforeCompile(program('second source', '1.0.0'))

  Tests.expect(events).toEqual(['input', 'read', 'drift', 'sidecars', 'sidecars'])
  Tests.expect(second.snapshotDirectories).toEqual(first.snapshotDirectories)
  Tests.expect(runtimeOptions.dependencyDirectory).toBe('/profile/node_modules')
  Tests.expect(runtimeOptions.watchFolders).toEqual(['/base', '/profile', '/session/foreign-views'])
  Tests.expect(runtimeOptions.singletonPackages).toEqual([
    'react',
    'react-dom',
    'react-native',
    'react-native-web',
    'expo',
    'declared-singleton',
    'native-addon',
  ])
})

Tests.test('a changed dependency graph requests preview restart and retains the validated graph', async () => {
  const events: string[] = []
  const pipeline = ProjectPipeline.createProjectPipeline('/project', '/session', {}, fakeServices(events))
  await pipeline.beforeCompile(program('first graph', '1.0.0'))

  await Tests.rejects(
    pipeline.beforeCompile(program('changed graph', '2.0.0')),
    RestartRequiredWithoutNativeRebuildRegx,
  )
  Tests.expect(events).toEqual(['input', 'read', 'drift', 'sidecars', 'input'])
})

Tests.test('a changed graph with native packages calls out the native rebuild', async () => {
  const pipeline = ProjectPipeline.createProjectPipeline(
    '/project',
    '/session',
    {},
    fakeServices([], undefined, ['native-addon']),
  )
  await pipeline.beforeCompile(program('first graph', '1.0.0'))

  await Tests.rejects(
    pipeline.beforeCompile(program('changed graph', '2.0.0')),
    RestartRequiredWithNativeRebuildRegx,
  )
})

Tests.test('ordinary source edits do not inspect generated setup files again', async () => {
  const events: string[] = []
  const pipeline = ProjectPipeline.createProjectPipeline('/project', '/session', {}, fakeServices(events, 2))
  await pipeline.beforeCompile(program('first source', '1.0.0'))

  await pipeline.beforeCompile(program('edited source', '1.0.0'))
  Tests.expect(events).toEqual(['input', 'read', 'drift', 'sidecars', 'sidecars'])
})

function fakeServices(
  events: string[],
  driftOnCall?: number,
  nativePackages: string[] = [],
  singletonPackages: string[] = [],
): ProjectPipeline.ProjectPipelineServices {
  let driftCount = 0
  let snapshotCount = 0
  return {
    async buildManagedInput(_root, graph) {
      events.push('input')
      return createManagedInput(graph, singletonPackages)
    },
    async readManaged() {
      events.push('read')
      return {
        graphFingerprint: 'graph-key',
        fingerprint: 'graph',
        packageDirectory: '/profile',
        lockfile: '/profile/bun.lock',
        nativePackages,
      } satisfies ManagedModules.PreparedManagedModules
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
        watchFiles: [],
        snapshotDirectories: ['/session/foreign-views/snapshots'],
      } satisfies PreparedSidecars
    },
  }
}

function createManagedInput(
  graph: Typecheck.LinkedProgram,
  singletonPackages: string[],
): ManagedModules.ManagedModulesInput {
  return {
    directory: '/project',
    modules: [{
      directory: '/project',
      requirements: [{ name: 'dep', version: requirementVersion(graph), origin: '/project/main.tao' }],
    }],
    target: 'web',
    runtimePins: { react: '19.2.3', zod: '4.6.7' },
    singletonPackages,
    bunVersion: 'test',
  }
}

function program(source: string, requirement: string): Typecheck.LinkedProgram {
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
  } as unknown as Typecheck.LinkedProgram
}

function projectDocument(source: string, requirement: string): AST.Document {
  const range = Range(0, source.length)
  return {
    root: {
      range,
      kind: 'File',
      block: {
        range,
        kind: 'Block',
        statements: [projectView(source), projectRequirement(requirement)],
      },
    },
  }
}

function projectView(source: string): AST.ViewDeclaration {
  const range = Range(0, source.length)
  return {
    range,
    kind: 'ViewDeclaration',
    name: { kind: 'Name', range: Range(), value: 'Main' },
    visibility: undefined,
    parameters: [],
    body: {
      range,
      kind: 'Block',
      statements: [{
        range,
        kind: 'RenderInjectStatement',
        injection: { kind: 'Injection', range: Range(), captures: [], code: '' },
      }],
    },
  }
}

function projectRequirement(version: string): AST.RequiresDeclaration {
  return {
    kind: 'RequiresDeclaration',
    range: Range(),
    provider: 'npm',
    identifier: 'dep',
    version,
    alias: undefined,
  }
}

function requirementVersion(program: Typecheck.LinkedProgram): string {
  return (program as Typecheck.LinkedProgram & { requirement: string }).requirement
}
