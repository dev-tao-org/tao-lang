import { Errors } from '@shared'
import * as Tests from '@shared-tests'

import { installTailscale } from '../../../CLIs-src/dev-cli/TailscaleInstall'

Tests.test('Tailscale installation verifies the official package before invoking the privileged installer', async () => {
  const commands: string[] = []
  const io = createInstallerIO(commands)
  await installTailscale(false, io)
  Tests.expect(commands).toEqual([
    'curl --fail --location --proto =https --tlsv1.2',
    'pkgutil --check-signature',
    'sudo installer',
  ])
  commands.length = 0
  await Tests.expect(installTailscale(false, {
    ...io,
    async execute(command) {
      commands.push(String(command))
      if (command === 'pkgutil --check-signature') {
        Errors.ThrowUserInput('Fixture signature rejected')
      }
    },
  })).rejects.toThrow('Fixture signature rejected')
  Tests.expect(commands).not.toContain('sudo installer')
})

Tests.test('Tailscale preview and existing installation leave machine configuration alone', async () => {
  const commands: string[] = []
  const io = createInstallerIO(commands)
  await installTailscale(true, io)
  await installTailscale(false, { ...io, exists: async () => true })
  Tests.expect(commands).toEqual([])
})

function createInstallerIO(commands: string[]): NonNullable<Parameters<typeof installTailscale>[1]> {
  return {
    platform: 'Darwin',
    interactive: true,
    exists: async () => false,
    readIndex: async () => '<a href="Tailscale-1.104.4-macos.pkg">macOS</a>',
    async execute(command, options) {
      commands.push(String(command))
      if (String(command).startsWith('curl ')) {
        Tests.expect(options?.variadicArgs?.at(-1)).toBe(
          'https://pkgs.tailscale.com/stable/Tailscale-1.104.4-macos.pkg',
        )
      }
    },
    async executeInteractive(command) {
      commands.push(String(command))
    },
    print() {},
    progress() {},
  }
}
