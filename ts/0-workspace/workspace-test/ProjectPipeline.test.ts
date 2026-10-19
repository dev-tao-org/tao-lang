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

  Tests.expect(events).toEqual(['input', 'read', 'drift', 'sidecars', 'input', 'drift', 'sidecars'])
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
    /Dependency graph changed\. Run tao prepare, then restart preview\.(?! A native rebuild)/,
  )
  Tests.expect(events).toEqual(['input', 'read', 'drift', 'sidecars', 'input'])
})

Tests.test('a changed graph with native packages calls out the native rebuild', async () => {
  const pipeline = createProjectPipeline('/project', '/session', {}, fakeServices([], undefined, ['native-addon']))
  await pipeline.beforeCompile(program('first graph', '1.0.0'))

  await Tests.rejects(
    pipeline.beforeCompile(program('changed graph', '2.0.0')),
    /Dependency graph changed\. Run tao prepare, then restart preview\. A native rebuild is also required\./,
  )
})

Tests.test('generated-file drift on a later compile blocks the new preview', async () => {
  const events: string[] = []
  const pipeline = createProjectPipeline('/project', '/session', {}, fakeServices(events, 2))
  await pipeline.beforeCompile(program('first source', '1.0.0'))

  await Tests.rejects(pipeline.beforeCompile(program('edited source', '1.0.0')), /Generated dependency files changed/)
  Tests.expect(events).toEqual(['input', 'read', 'drift', 'sidecars', 'input', 'drift'])
})

function fakeServices(
  events: string[],
  driftOnCall?: number,
  nativePackages: string[] = [],
): ProjectPipelineServices {
  let driftCount = 0
  let snapshotCount = 0
  return {
    async managedInput(_root, graph) {
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
    async generatedFiles() {
      events.push('drift')
      driftCount++
      return driftCount === driftOnCall
        ? [{ path: '/project/tsconfig.json', owner: '/project', repair: 'tao prepare --repair' }]
        : []
    },
    async prepareSidecars() {
      events.push('sidecars')
      snapshotCount++
      return {
        fingerprint: `snapshots-${snapshotCount}`,
        foreignViewPath: () => '/session/foreign-views/view.tsx',
        watchDirectories: ['/project/source'],
        snapshotDirectories: ['/session/foreign-views/snapshots'],
      } satisfies PreparedSidecars
    },
  }
}

function program(source: string, requirement: string): LinkedProgram {
  return {
    entry: '/project/main.tao',
    modules: [{
      path: '/project/main.tao',
      document: { root: { declarations: [{ kind: 'ViewDeclaration', source }] } },
      bindings: [],
    }],
    definitions: [],
    requirement,
  } as unknown as LinkedProgram
}

function requirementVersion(program: LinkedProgram): string {
  return (program as LinkedProgram & { requirement: string }).requirement
}
