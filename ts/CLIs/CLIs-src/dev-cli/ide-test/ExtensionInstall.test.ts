import { Tests } from '@shared/os'
import { installExtension } from '../ide/ExtensionInstall'

Tests.test('extension installation forwards one VSIX to both editors without splitting its path', async () => {
  const calls: unknown[] = []
  await installExtension('/owned/artifacts/Tao Extension.vsix', async (command, options) => {
    calls.push({ command, options })
  }, async command => command.startsWith('cursor ') ? 'devtao.tao\ntao.tao-language' : 'devtao.tao')
  Tests.expect(calls).toEqual([
    { command: 'cursor --uninstall-extension tao.tao-language', options: undefined },
    ...['cursor', 'code'].map(editor => ({
      command: `${editor} --install-extension`,
      options: { variadicArgs: ['/owned/artifacts/Tao Extension.vsix', '--force'] },
    })),
  ])
})
