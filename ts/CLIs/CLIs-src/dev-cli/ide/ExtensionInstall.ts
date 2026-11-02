import { runNonInteractiveCommand } from '@cli-kit'
import { Regxs } from '@shared'
import { Platform } from '@shared/os'

/** installExtensions installs both built VSIX files into Cursor and VS Code without opening editor windows. */
export async function installExtensions(
  vsixs: readonly string[],
  run = runNonInteractiveCommand,
  capture = Platform.capture,
): Promise<void> {
  for (const editor of ['cursor', 'code']) {
    const installed = (await capture(`${editor} --list-extensions`)).split(Regxs.ExtensionLineEndingRegx)
    if (installed.includes('tao.tao-language')) {
      await run(`${editor} --uninstall-extension tao.tao-language`)
    }
    for (const vsix of vsixs) {
      await run(`${editor} --install-extension`, { variadicArgs: [vsix, '--force'] })
    }
  }
}
