import { runCommand } from '@cli-kit'
import { Platform } from '@shared/os'

/** installExtension installs the same built VSIX into Cursor and VS Code without opening editor windows. */
export async function installExtension(vsix: string, run = runCommand, capture = Platform.capture): Promise<void> {
  for (const editor of ['cursor', 'code']) {
    const installed = (await capture(`${editor} --list-extensions`)).split(/\r?\n/u)
    if (installed.includes('tao.tao-language')) {
      await run(`${editor} --uninstall-extension tao.tao-language`)
    }
    await run(`${editor} --install-extension`, { variadicArgs: [vsix, '--force'] })
  }
}
