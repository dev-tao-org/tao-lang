import { runCommand } from '@cli-kit'

/** installExtension installs the same built VSIX into Cursor and VS Code without opening editor windows. */
export async function installExtension(vsix: string, run = runCommand): Promise<void> {
  for (const editor of ['cursor', 'code']) {
    await run(`${editor} --install-extension`, { variadicArgs: [vsix, '--force'] })
  }
}
