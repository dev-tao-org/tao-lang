import { Tests } from '@shared/os'
import { planTypeScriptShards } from '../testing/TypeScriptShardPlan'

Tests.test('full-suite shards preserve every file exactly once and isolate expensive resource groups', () => {
  const files = [
    '/ts/runtime/ToolchainAcceptance.test.ts',
    '/ts/workspace/ManagedMetroAcceptance.test.ts',
    '/ts/runtime/ReactOwnership.test.ts',
    '/ts/workspace/CompilerRefreshAcceptance.test.ts',
    '/ts/workspace/NestedRefresh.test.ts',
    '/ts/perf/PreviewRecovery.test.ts',
    '/ts/shared/Other.test.ts',
    '/ts/new/Future.test.ts',
  ]
  const shards = planTypeScriptShards(files, 3)
  Tests.expect(shards).toEqual([
    ['/ts/runtime/ToolchainAcceptance.test.ts', '/ts/workspace/ManagedMetroAcceptance.test.ts'],
    [
      '/ts/perf/PreviewRecovery.test.ts',
      '/ts/runtime/ReactOwnership.test.ts',
      '/ts/workspace/CompilerRefreshAcceptance.test.ts',
      '/ts/workspace/NestedRefresh.test.ts',
    ],
    ['/ts/new/Future.test.ts', '/ts/shared/Other.test.ts'],
  ])
  for (const budget of [1, 2, 3, 5]) {
    const planned = planTypeScriptShards(files, budget)
    Tests.expect(planned.length).toBeLessThanOrEqual(budget)
    Tests.expect(planned.flat().sort()).toEqual([...files].sort())
  }
  Tests.expect(planTypeScriptShards([], 3)).toEqual([])
})
