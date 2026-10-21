import { registerCommand } from './_command-runner'

/** buildIdeExtensionCommand builds self-contained language and developer extension VSIX packages. */
export default registerCommand({
  name: 'build-ide-extension',
  description: 'Build both Tao extension VSIX packages without installing them.',
  async action() {
    const { buildExtensions } = await import('../ide/Extensions')
    await buildExtensions()
  },
})
