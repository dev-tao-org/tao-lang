import { Tests } from '@shared/os'
import { installExtension } from '../ide/ExtensionInstall'

Tests.test('extension installation forwards one VSIX to both editors without splitting its path', async () => {
  const calls: unknown[] = []
  await installExtension('/owned/artifacts/Tao Extension.vsix', async (command, options) => {
    calls.push({ command, options })
  })
  Tests.expect(calls).toEqual(['cursor', 'code'].map(editor => ({
    command: `${editor} --install-extension`,
    options: { variadicArgs: ['/owned/artifacts/Tao Extension.vsix', '--force'] },
  })))
})
