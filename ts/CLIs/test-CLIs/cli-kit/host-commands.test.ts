import * as Tests from '@shared-tests'

import { runHostCommand } from '../../CLIs-src/cli-kit/host-commands'

Tests.test('host secret entry owns the terminal while batch host operations keep stdin closed', async () => {
  const events: string[] = []
  const execution: NonNullable<Parameters<typeof runHostCommand>[1]> = {
    async requireAccess() {
      events.push('access')
    },
    async executeInteractive(command, options) {
      events.push(`interactive:${command}:${options?.variadicArgs?.join(' ')}`)
    },
    async executeNonInteractive(command, options) {
      events.push(`noninteractive:${command}:${options?.variadicArgs?.join(' ')}`)
    },
  }
  await runHostCommand(['secrets', 'add', 'FIXTURE_KEY'], execution)
  await runHostCommand(['secrets', 'list'], execution)
  await runHostCommand(['git', 'status'], execution)
  Tests.expect(events).toEqual([
    'access',
    'interactive:./dev secrets:add FIXTURE_KEY',
    'access',
    'noninteractive:./dev secrets:list',
    'access',
    'noninteractive:git status:',
  ])
})
