import { registerCommand } from './_command-runner'

/** installIdeExtensionCommand builds and installs both Tao extensions into both supported editors. */
export default registerCommand({
  name: 'install-ide-extension',
  description: 'Build both Tao extensions and install them into Cursor and VS Code.',
  async action() {
    const { buildExtensions } = await import('../ide/Extensions')
    const { installExtensions } = await import('../ide/ExtensionInstall')
    await installExtensions(await buildExtensions())
  },
})
