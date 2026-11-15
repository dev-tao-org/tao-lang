import * as CLIKit from '@cli-kit'
import { Regxs } from '@shared'

import { Exec } from '@shared/os'

/** installExtensions installs both built VSIX files into Cursor and VS Code without opening editor windows. */
export async function installExtensions(
  vsixs: readonly string[],
  run = CLIKit.runNonInteractiveCommand,
  readStdout: (command: string, args: Exec.CommandArgs) => Promise<string> = Exec.captureStdout,
): Promise<void> {
  for (const editor of ['cursor', 'code']) {
    const installed = (await readStdout(editor, '--list-extensions')).split(Regxs.ExtensionLineEndingRegx)
    if (installed.includes('tao.tao-language')) {
      await run(`${editor} --uninstall-extension tao.tao-language`)
    }
    for (const vsix of vsixs) {
      await run(`${editor} --install-extension`, { variadicArgs: [vsix, '--force'] })
    }
  }
}
