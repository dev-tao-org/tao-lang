import { Tests } from '@shared/os'
import { installExtensions } from '../ide/ExtensionInstall'

Tests.test('extension installation forwards both VSIX files to both editors without splitting paths', async () => {
  const calls: unknown[] = []
  const packages = ['/owned/artifacts/Tao Extension.vsix', '/owned/artifacts/Dev Tao Org.vsix']
  await installExtensions(packages, async (command, options) => {
    calls.push({ command, options })
  }, async command => command.startsWith('cursor ') ? 'devtao.tao\ntao.tao-language' : 'devtao.tao')
  Tests.expect(calls).toEqual([
    { command: 'cursor --uninstall-extension tao.tao-language', options: undefined },
    ...['cursor', 'code'].flatMap(editor =>
      packages.map(vsix => ({
        command: `${editor} --install-extension`,
        options: { variadicArgs: [vsix, '--force'] },
      }))
    ),
  ])
})
