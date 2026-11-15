import { Regxs, Sort } from '@shared'
import { Path } from '@shared/os'

type TestBatch = { files: string[]; durationMs: number }

/** planTypeScriptShards packs measured test costs within a worker budget, preserving resource groups. */
export function planTypeScriptShards(files: readonly string[], workers: number): string[][] {
  const shardCount = Math.min(workers, files.length)
  if (shardCount < 1) {
    return []
  }
  const shards = Array.from({ length: shardCount }, (): TestBatch => ({ files: [], durationMs: 0 }))
  const batches = groupTestFiles(files).sort((left, right) => right.durationMs - left.durationMs)
  for (const batch of batches) {
    const lightest = shards.reduce((best, shard) => shard.durationMs < best.durationMs ? shard : best)
    lightest.files.push(...batch.files)
    lightest.durationMs += batch.durationMs
  }
  return shards.filter(shard => shard.files.length > 0).map(shard => shard.files.sort(Sort.CompareStrings))
}

function groupTestFiles(files: readonly string[]): TestBatch[] {
  const managed: TestBatch = { files: [], durationMs: 0 }
  const refresh: TestBatch = { files: [], durationMs: 0 }
  const batches = [managed, refresh]
  for (const file of [...files].sort(Sort.CompareStrings)) {
    const name = Path.basename(file)
    const durationMs = estimateTestDuration(name)
    if (Regxs.ManagedTestShardRegx.test(name)) {
      managed.files.push(file)
      managed.durationMs += durationMs
    } else if (Regxs.LargeTestShardRegx.test(name)) {
      refresh.files.push(file)
      refresh.durationMs += durationMs
    } else {
      batches.push({ files: [file], durationMs })
    }
  }
  return batches.filter(batch => batch.files.length > 0)
}

type TestDurationEstimates = Readonly<Record<string, number>>

// File wall times from two passing five-shard runs, rounded to 10 ms.
const MeasuredTestMs: TestDurationEstimates = {
  'Bootstrap.test.ts': 210,
  'cli-checks.source-conformance-api.test.ts': 720,
  'cli-checks.source-conformance-call-layout.test.ts': 380,
  'cli-checks.source-conformance-constant-order.test.ts': 490,
  'cli-checks.source-conformance-contracts.test.ts': 610,
  'cli-checks.source-conformance-facades.test.ts': 890,
  'cli-checks.source-conformance-fix.test.ts': 300,
  'cli-checks.source-conformance-json.test.ts': 210,
  'cli-checks.source-conformance-result-contracts.test.ts': 190,
  'cli-checks.source-conformance-type-order.test.ts': 600,
  'cli-kit.cmd-exec.test.ts': 210,
  'client.ReactOwnership.test.ts': 3190,
  'Compile.Core.test.ts': 150,
  'dev-cli.cli-environment.test.ts': 1210,
  'dev-cli.cli-generated-bootstrap.test.ts': 470,
  'dev-cli.direnv-activation.test.ts': 350,
  'dev-cli.direnv-setup.test.ts': 270,
  'dev-cli.prepared-environment.test.ts': 150,
  'dev-cli.TaoRun.test.ts': 2740,
  'dev-cli.TSLib.test.ts': 2600,
  'dev-cli.TSLibRun.test.ts': 1760,
  'expo.ToolchainAcceptance.test.ts': 6850,
  'Fix.Corpus.test.ts': 220,
  'Fix.Embedded.test.ts': 110,
  'FS.Files.GeneratedMetadata.test.ts': 120,
  'IDE.session.test.ts': 230,
  'incremental-review.Continue.test.ts': 4350,
  'ManagedModule.Core.test.ts': 490,
  'ManagedModule.Transitions.test.ts': 210,
  'ManagedNpm.Lock.test.ts': 140,
  'ManagedNpm.Patches.test.ts': 130,
  'Metro.Guards.test.ts': 800,
  'Metro.Integration.test.ts': 1180,
  'net.Http.test.ts': 1160,
  'output.Layout.test.ts': 210,
  'output.Logging.test.ts': 2100,
  'output.PaneInteraction.test.ts': 390,
  'performance-investigation.Snapshot.test.ts': 2770,
  'Preview.Recovery.test.ts': 2400,
  'Exec.CommandCapture.test.ts': 220,
  'Exec.Core.test.ts': 520,
  'projects.Core.test.ts': 140,
  'push.Integration.test.ts': 550,
  'review-learning.Learning.test.ts': 680,
  'Runtime.test.ts': 920,
  'SidecarPipeline.Core.test.ts': 2800,
  'SidecarPipeline.Imports.test.ts': 120,
  'SidecarPipeline.NestedForeignViews.test.ts': 110,
  'sidecars.ManagedMetroAcceptance.test.ts': 8240,
  'skills.cript.test.ts': 100,
  'source.TaoSource.test.ts': 430,
  'Storage.Core.test.ts': 260,
  'Storage.LeaseFailures.test.ts': 230,
  'tao-cli.Init.test.ts': 990,
  'tao-cli.RunEnvironment.test.ts': 320,
  'tao-cli.Source.test.ts': 1970,
  'tao-cli.StarterPreview.test.ts': 3600,
  'tao-cli.Test.test.ts': 1120,
  'timing.Comparison.test.ts': 150,
  'Workspace.Build.test.ts': 130,
  'Workspace.Compilation.test.ts': 180,
  'Workspace.CompilerRefreshAcceptance.test.ts': 3050,
  'Workspace.ConsumerProject.test.ts': 120,
  'Workspace.LibraryDependencies.test.ts': 4220,
  'Workspace.ManagedDependenciesAcceptance.test.ts': 880,
  'Workspace.Navigation.test.ts': 890,
  'Workspace.NestedRefresh.test.ts': 2660,
}
const UnmeasuredTestMs = 36

function estimateTestDuration(name: string): number {
  return MeasuredTestMs[name] ?? UnmeasuredTestMs
}
