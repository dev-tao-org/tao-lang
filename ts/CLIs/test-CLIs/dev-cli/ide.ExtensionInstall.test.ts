import { S } from '@shared'
import * as Tests from '@shared-tests'

import { installExtensions } from '../../CLIs-src/dev-cli/ide/ExtensionInstall'

Tests.test('extension installation forwards both VSIX files to both editors without splitting paths', async () => {
  const calls: unknown[] = []
  const packages = ['/owned/artifacts/Tao Extension.vsix', '/owned/artifacts/Dev Tao Org.vsix']
  await installExtensions(packages, async (command, options) => {
    calls.push({ command, options })
  }, async command =>
    command === 'cursor'
      ? S`
        devtao.tao
        tao.tao-language
      `
      : 'devtao.tao')
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
