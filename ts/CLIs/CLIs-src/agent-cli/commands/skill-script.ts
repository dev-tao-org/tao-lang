import * as CLIKit from '@cli-kit'
import { registerCommand } from '../../dev-cli/commands/_command-runner'
import { runSkillScript } from '../skills/SkillScript'

/** skillScriptCommand runs a validated script owned by an installed skill. */
export default registerCommand({
  name: 'skill-script',
  description: 'Run a TypeScript script from an installed skill.',
  arguments: [{
    name: 'entry-and-args',
    required: true,
    variadic: true,
    description: 'Skill entry script followed by its arguments after --.',
  }],
  allowUnknownOptions: true,
  async action(args: string[]) {
    const [entryPath, ...scriptArgs] = args
    await runSkillScript(CLIKit.resolveCallerPath(entryPath), scriptArgs)
  },
})
