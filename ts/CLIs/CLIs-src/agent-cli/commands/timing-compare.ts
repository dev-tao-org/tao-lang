import { IO } from '@cli-kit'
import { Errors, NewlineCharacter } from '@shared'
import { Path } from '@shared/os'
import * as BranchComparison from '../../agent-skills/performance-investigation/BranchComparison'
import { requireHost } from '../../agent-skills/performance-investigation/Remote'
import { registerCommand } from '../../dev-cli/commands/_command-runner'
import { readTimingRemote } from '../../dev-cli/timing/TimingRemote'
import { createTimingHelperArguments } from '../../dev-cli/timing/TimingReport'

type TimingCompareOptions = { tooling?: string; pairs: string; firstEdit?: boolean }

/** timingCompareCommand benchmarks two prepared revisions on the same runner using current comparison tooling. */
export default registerCommand({
  name: 'timing-compare',
  description: 'Compare baseline and candidate preview speed on a timing laptop.',
  arguments: [
    { name: 'host', required: true, description: 'Existing SSH alias or user@hostname.' },
    { name: 'baseline', required: true, description: 'Absolute path to the prepared baseline checkout on the runner.' },
    {
      name: 'candidate',
      required: true,
      description: 'Absolute path to the prepared candidate checkout on the runner.',
    },
  ],
  options: [
    { flags: '--tooling <path>', description: 'Required path to an up-to-date tooling checkout on the runner.' },
    { flags: '--pairs <count>', description: 'Independent pairs per round, at least five.', defaultValue: '5' },
    { flags: '--first-edit', description: 'Measure only first-edit timing and repeat the batch.' },
  ],
  async action(
    host: string,
    baseline: string,
    candidate: string,
    options: TimingCompareOptions,
  ) {
    const directory = options.tooling
    if (!directory) {
      Errors.ThrowUserInput('Supply --tooling with the absolute path to the up-to-date runner tooling checkout.')
    }
    requireHost(host)
    requireAbsoluteCheckouts([baseline, candidate, directory])
    BranchComparison.requireBranchPairCount(Number(options.pairs))
    const remote = { host, directory, controlPath: 'none' }
    const help = await readTimingRemote({ ...remote, args: createTimingHelperArguments('compare', ['--help']) })
    if (!help.includes('--first-edit')) {
      Errors.ThrowUserInput('Update the runner tooling checkout before comparing branches.')
    }
    const args = createTimingHelperArguments('compare', [
      baseline,
      candidate,
      '--pairs',
      options.pairs,
      ...options.firstEdit ? ['--first-edit'] : [],
    ])
    const output = await readTimingRemote({ ...remote, args })
    IO.summary(readBranchReport(output))
  },
})

function requireAbsoluteCheckouts(paths: string[]): void {
  if (paths.some(path => !Path.posix.isAbsolute(path))) {
    Errors.ThrowUserInput('Use absolute baseline, candidate and tooling paths on the runner.')
  }
}

function readBranchReport(text: string): string {
  const lines = text.split(NewlineCharacter)
  const start = lines.indexOf(BranchComparison.BranchReportStart)
  const end = lines.indexOf(BranchComparison.BranchReportEnd, start + 1)
  if (start === -1 || end <= start + 1) {
    Errors.ThrowHostEnvironment('Missing branch timing report. Inspect the retained runner output.')
  }
  return lines.slice(start + 1, end).join(NewlineCharacter)
}
