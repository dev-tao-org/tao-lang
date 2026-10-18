import { registerCommand } from './_command-runner'

/** installIdeExtensionCommand builds once and installs the Tao extension into both supported editors. */
export default registerCommand({
  name: 'install-ide-extension',
  description: 'Build the Tao extension and install it into Cursor and VS Code.',
  async action() {
    const { buildExtension } = await import('../ide/ExtensionBuild')
    const { installExtension } = await import('../ide/ExtensionInstall')
    await installExtension(await buildExtension())
  },
})
