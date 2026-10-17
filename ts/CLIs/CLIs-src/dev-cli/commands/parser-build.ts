import { prepareParser } from '../../cli-checks/parser-build'
import { registerCommand } from './_command-runner'

/** parserBuildCommand rebuilds the native Tree-sitter grammar from its handwritten sources. */
export default registerCommand({
  name: 'parser-build',
  description: 'Regenerate and rebuild the native Tao grammar.',
  async action() {
    await prepareParser(true)
  },
})
