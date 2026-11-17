import { IO } from '@cli-kit'
import { Errors, NewlineCharacter, UserInput } from '@shared'
import { Path } from '@shared/os'
import { requireHost } from '../../agent-skills/performance-investigation/Remote'
import { readTimingRemote } from '../timing/TimingRemote'
import { createTimingHelperArguments } from '../timing/TimingReport'
import { registerCommand } from './_command-runner'

type TimingCompareOptions = { tooling?: string; pairs: string; label?: string }

/** timingCompareCommand benchmarks two prepared revisions on the same runner with one SSH invocation. */
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
    { flags: '--tooling <path>', description: 'Prepared tooling checkout on the runner; defaults to the candidate.' },
    { flags: '--pairs <count>', description: 'Independent pairs per round, at least five.', defaultValue: '5' },
    { flags: '--label <name>', description: 'Agent or chat name to print in the runner’s live log.' },
  ],
  async action(
    host: string,
    baseline: string,
    candidate: string,
    options: TimingCompareOptions,
  ) {
    const BranchComparison = await import('../../agent-skills/performance-investigation/BranchComparison')
    const directory = options.tooling ?? candidate
    requireHost(host)
    requireAbsoluteCheckouts([baseline, candidate, directory])
    BranchComparison.requireBranchPairCount(Number(options.pairs))
    const args = createTimingHelperArguments('compare', [
      baseline,
      candidate,
      '--pairs',
      options.pairs,
      ...options.label === undefined ? [] : ['--label', options.label],
    ])
    const output = await readTimingRemote({ host, directory, controlPath: 'none', args })
    IO.summary(readBranchReport(output, BranchComparison.BranchReportStart, BranchComparison.BranchReportEnd))
  },
})

function requireAbsoluteCheckouts(paths: string[]): void {
  UserInput.require(
    !paths.some(path => !Path.posix.isAbsolute(path)),
    'Use absolute baseline, candidate and tooling paths on the runner.',
  )
}

function readBranchReport(text: string, startMarker: string, endMarker: string): string {
  const lines = text.split(NewlineCharacter)
  const start = lines.indexOf(startMarker)
  const end = lines.indexOf(endMarker, start + 1)
  if (start === -1 || end <= start + 1) {
    Errors.ThrowHostEnvironment('Missing branch timing report. Inspect the retained runner output.')
  }
  return lines.slice(start + 1, end).join(NewlineCharacter)
}
