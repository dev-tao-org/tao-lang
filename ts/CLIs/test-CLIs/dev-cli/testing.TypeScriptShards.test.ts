import * as Tests from '@shared-tests'

import { planTypeScriptShards } from '../../CLIs-src/dev-cli/testing/TypeScriptShardPlan'

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
