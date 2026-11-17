import { IO } from '@cli-kit'
import { UserInput } from '@shared'
import { Env } from '@shared/os'

import { DefaultTimingEdits, DefaultTimingSamples } from '../timing/TimingCommandOptions'
import { registerCommand } from './_command-runner'

type RunnerCheckout = string | undefined
type TimingOptions = { host?: string; local?: boolean; dryRun?: boolean }

/** timingCommand sends standard preview timing jobs to the dedicated runner by default. */
export default registerCommand({
  name: 'timing',
  description: 'Measure preview speed in an isolated checkout under the timing runner’s lock.',
  arguments: [{ name: 'checkout', description: 'Prepared runner checkout. Defaults to TAO_TIMING_CHECKOUT.' }],
  options: [
    { flags: '--host <host>', description: 'Timing runner SSH endpoint. Defaults to TAO_TIMING_HOST.' },
    { flags: '--local', description: 'Run a local preview diagnostic.' },
    { flags: '--dry-run', description: 'Show the timing plan without starting a measurement.' },
  ],
  async action(checkout: RunnerCheckout, options: TimingOptions) {
    if (options.local) {
      await runLocalDiagnostic(checkout, options)
      return
    }
    const host = options.host ?? Env.get('TAO_TIMING_HOST')
    const repo = checkout ?? Env.get('TAO_TIMING_CHECKOUT')
    UserInput.require(
      !(!host || !repo),
      'Set TAO_TIMING_HOST and TAO_TIMING_CHECKOUT, or pass --host and a prepared runner checkout.',
    )
    const { runTiming } = await import('../timing/TimingRun')
    await runTiming({ host, repo, samples: DefaultTimingSamples, edits: DefaultTimingEdits, dryRun: options.dryRun })
  },
})

async function runLocalDiagnostic(checkout: RunnerCheckout, options: TimingOptions): Promise<void> {
  UserInput.require(
    !(checkout !== undefined || options.host !== undefined),
    '--local measures the current checkout. Omit the runner checkout and --host.',
  )
  // Formal speed tests run on the dedicated timing machine in an isolated checkout under its timing lock.
  if (options.dryRun) {
    IO.print('Would run a local preview diagnostic in the current checkout.')
    return
  }
  IO.warn('Local preview diagnostic. Run formal speed tests on the dedicated timing machine under its timing lock.')
  const { default: performance } = await import('./performance')
  await performance.action('preview', {})
}
