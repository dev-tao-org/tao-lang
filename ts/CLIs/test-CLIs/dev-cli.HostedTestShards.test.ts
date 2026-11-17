import * as Tests from '@shared-tests'
import { Repo } from '@shared/os'
import * as HostedShards from '../CLIs-src/dev-cli/testing/HostedTestShards'

Tests.test('Hosted shard identities reject out-of-range and non-numeric partitions', () => {
  Tests.expect(HostedShards.parseTestShard('2/3')).toEqual({ index: 2, count: 3 })
  for (const invalid of ['0/3', '4/3', '1/0', '2', '1/9007199254740992']) {
    Tests.expect(() => HostedShards.parseTestShard(invalid)).toThrow('--shard requires')
  }
})

Tests.test('Hosted native shards assign each file and the compiled consumer once regardless of discovery order', async () => {
  const files = [
    Repo.resolvePath('Apps/Dev/Kitchen Sink/Kitchen Sink.tao'),
    Repo.resolvePath('Apps/Tests/UI Interactions/Forms.test.tao'),
    Repo.resolvePath('Apps/TS Lib App'),
  ]
  const select = (units: readonly string[]) =>
    Promise.all([1, 2].map(index => HostedShards.selectHostedNativeFiles(units, 'android', { index, count: 2 })))
  const shards = await select(files)
  Tests.expect(shards.flat().sort()).toEqual([...files].sort())
  Tests.expect(await select([...files].reverse())).toEqual(shards)
  await Tests.expect(HostedShards.selectHostedNativeFiles(files, 'android', { index: 1, count: 4 }))
    .rejects.toThrow('Cannot assign 4 non-empty test shards.')
})

Tests.test('The hosted TypeScript shards cover the single-run inventory without overlap', async () => {
  const all = await HostedShards.selectHostedTypeScriptFiles({ index: 1, count: 1 })
  const shards = await Promise.all(
    [1, 2, 3].map(index => HostedShards.selectHostedTypeScriptFiles({ index, count: 3 })),
  )
  Tests.expect(shards.flat().sort()).toEqual(all.sort())
  Tests.expect(shards.every(shard => shard.length > 0)).toBe(true)
})
