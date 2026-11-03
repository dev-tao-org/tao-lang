import { Errors } from '@shared'
import * as Tests from '@shared-tests'

import * as ExternalErrors from '@shared/errors/external'
import { createOutput } from '../../../CLIs-src/cli-kit/output/Output'
import { readTimingRemote } from '../../../CLIs-src/dev-cli/timing/TimingRemote'

Tests.test('timing capture retains the job identity in output even when the remote command fails', async () => {
  const retained: string[] = []
  const output = createOutput(event => retained.push(event.text))
  const failure = ExternalErrors.fromUnknown(new Error('fixture SSH failed'))
  const request = { host: 'fixture.local', directory: '/fixture', controlPath: '/fixture/socket', args: ['fixture'] }
  const execute: Parameters<typeof readTimingRemote>[1] = async (_command, options) => {
    options?.output?.stdout('Performance job: /fixture/job\n')
    options?.output?.stdout('partial diagnostics\n')
    Errors.Throw(failure)
  }
  await Tests.expect(readTimingRemote(request, execute, output.main)).rejects.toBe(failure)
  Tests.expect(retained.join('')).toBe('Performance job: /fixture/job\npartial diagnostics\n')
})
