import * as CLIKit from '@cli-kit'
import { Errors, Regxs, Try } from '@shared'
import { Env, Repo } from '@shared/os'
import Exec from '@shared/os/exec'
import { registerCommand } from './_command-runner'

/** myBranchCommand switches to the developer's existing personal branch. */
export default registerCommand({
  name: 'my-branch',
  description: 'Switch to a personal development branch.',
  arguments: [{
    name: 'name',
    description: 'Existing branch name or suffix; defaults to $TAO_DEV_BRANCH, Git config, then identity.',
    defaultValue: '',
  }],
  async action(name: string = '') {
    const cwd = Repo.getWorkspaceRoot()
    const branch = await resolveDeveloperBranch(name, cwd)
    await CLIKit.runNonInteractiveCommand('git', ['switch', branch], { cwd })
  },
})

const developerPrefix = 'dev/'

async function resolveDeveloperBranch(name: string, cwd: string): Promise<string> {
  const asked = name.trim()
  if (asked !== '') {
    return developerBranch(asked)
  }
  const fromEnvironment = (Env.get('TAO_DEV_BRANCH') ?? '').trim()
  if (fromEnvironment !== '') {
    return developerBranch(fromEnvironment)
  }
  const configured = await optionalGitValue('tao.devBranch', cwd)
  if (configured !== '') {
    return developerBranch(configured)
  }
  const identity = await optionalGitValue('user.name', cwd)
  const firstName = slug(identity.split(Regxs.BranchSlugWhitespaceRegx)[0] ?? '')
  return `${developerPrefix}${firstName || 'local'}`
}

function developerBranch(name: string): string {
  return name.startsWith(developerPrefix) ? name : `${developerPrefix}${slug(name)}`
}

function slug(value: string): string {
  return value.toLowerCase()
    .replaceAll(Regxs.BranchSlugInvalidCharacterRegx, '-')
    .replace(Regxs.BranchSlugEdgeDashesRegx, '')
}

async function optionalGitValue(key: string, cwd: string): Promise<string> {
  return Try(() => Exec.captureStdout('git', ['config', '--get', key], { cwd }), {
    catch(error) {
      if (isMissingConfigValue(error)) {
        return ''
      }
      Errors.Throw(error)
    },
  })
}

function isMissingConfigValue(error: unknown): boolean {
  return Errors.isCommandExecutionError(error) && error.result.status === 1
}
