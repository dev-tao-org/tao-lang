import * as CLIKit from '@cli-kit'
import { Regxs } from '@shared'

import Exec from '@shared/os/exec'

/** installExtensions installs both built VSIX files into Cursor and VS Code without opening editor windows. */
export async function installExtensions(vsixs: readonly string[]): Promise<void> {
  for (const editor of ['cursor', 'code']) {
    const installed = (await Exec.captureStdout(editor, '--list-extensions')).split(Regxs.ExtensionLineEndingRegx)
    if (installed.includes('tao.tao-language')) {
      await CLIKit.runNonInteractiveCommand(editor, '--uninstall-extension tao.tao-language')
    }
    for (const vsix of vsixs) {
      await CLIKit.runNonInteractiveCommand(editor, ['--install-extension', vsix, '--force'])
    }
  }
}
