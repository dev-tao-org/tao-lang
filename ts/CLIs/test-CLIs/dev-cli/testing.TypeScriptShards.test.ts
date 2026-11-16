import { Try } from '@shared'
import * as Tests from '@shared-tests'
import { Artifacts, FS, Path, Platform } from '@shared/os'

import { planTypeScriptShards } from '../../CLIs-src/dev-cli/testing/TypeScriptShardPlan'
import { readShardEstimates, rememberShardTimings } from '../../CLIs-src/dev-cli/testing/TypeScriptShardTimings'

Tests.test('full-suite shards preserve every file exactly once and isolate expensive resource groups', () => {
  const files = [
    '/ts/runtime/expo.ToolchainAcceptance.test.ts',
    '/ts/workspace/sidecars.ManagedMetroAcceptance.test.ts',
    '/ts/runtime/client.ReactOwnership.test.ts',
    '/ts/workspace/Workspace.CompilerRefreshAcceptance.test.ts',
    '/ts/workspace/Workspace.NestedRefresh.test.ts',
    '/ts/perf/Preview.Recovery.test.ts',
    '/ts/shared/Other.test.ts',
    '/ts/new/Future.test.ts',
  ]
  const shards = planTypeScriptShards(files, 3)
  Tests.expect(shards).toContainEqual([
    '/ts/runtime/expo.ToolchainAcceptance.test.ts',
    '/ts/workspace/sidecars.ManagedMetroAcceptance.test.ts',
  ])
  Tests.expect(shards).toContainEqual([
    '/ts/perf/Preview.Recovery.test.ts',
    '/ts/runtime/client.ReactOwnership.test.ts',
    '/ts/workspace/Workspace.CompilerRefreshAcceptance.test.ts',
    '/ts/workspace/Workspace.NestedRefresh.test.ts',
  ])
  Tests.expect(shards).toEqual(planTypeScriptShards([...files].reverse(), 3))
  Tests.expect(planTypeScriptShards(files, 5)).toHaveLength(4)
  for (const budget of [1, 2, 3, 5]) {
    const planned = planTypeScriptShards(files, budget)
    Tests.expect(planned.length).toBeLessThanOrEqual(budget)
    Tests.expect(planned.flat().sort()).toEqual([...files].sort())
  }
  Tests.expect(planTypeScriptShards([], 3)).toEqual([])
})

Tests.test('shard estimates use complete runs and distinguish files with the same basename', async () => {
  const directory = Artifacts.resolvePath('tmp', 'shard-timings-' + Platform.randomUUID())
  const cache = Path.join(directory, 'timings.json')
  const heavy = 'ts/first/Common.test.ts'
  const light = 'ts/second/Common.test.ts'
  const files = [heavy, light]
  await Try(async () => {
    Tests.expect((await readShardEstimates(cache)).size).toBe(0)
    for (const durationMs of [8000, 90000, 8200]) {
      await rememberShardTimings(cache, files, [
        { file: 'first/Common.test.ts', durationMs },
        { file: 'second/Common.test.ts', durationMs: 12 },
      ])
    }
    await rememberShardTimings(cache, files, [{ file: 'first/Common.test.ts', durationMs: 1 }])
    const estimates = await readShardEstimates(cache)
    Tests.expect(estimates.get(heavy)).toBe(8200)
    Tests.expect(estimates.get(light)).toBe(12)
    Tests.expect(planTypeScriptShards([...files, 'ts/new.test.ts'], 2, estimates)).toEqual([
      [heavy],
      ['ts/new.test.ts', light],
    ])
  }, { finally: () => FS.rm(directory, { force: true, recursive: true }) })
})
