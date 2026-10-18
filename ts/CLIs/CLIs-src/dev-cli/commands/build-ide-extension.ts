import { registerCommand } from './_command-runner'

/** buildIdeExtensionCommand builds one self-contained Tao extension VSIX. */
export default registerCommand({
  name: 'build-ide-extension',
  description: 'Build the Tao Tree-sitter extension VSIX without installing it.',
  async action() {
    const { buildExtension } = await import('../ide/ExtensionBuild')
    await buildExtension()
  },
})
