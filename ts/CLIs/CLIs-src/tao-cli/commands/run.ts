import { IO } from '@cli-kit'
import * as CLIKit from '@cli-kit'
import * as BridgeExpoConfig from '@runtime/bridges/Bridge_expo/Bridge_expo-config'
import { Errors, Try, UserInput } from '@shared'
import { Terminal } from '@shared/os'
import * as Workspace from '@workspace'

import { prepareRuntime } from '../../cli-checks/runtime-build'
import { registerCommand } from '../../dev-cli/commands/_command-runner'
import { prepareCompiledApplication } from '../CompileApplication'
import { workflowUI } from '../WorkflowUI'

type RunCommandOptions = { package?: string; session?: string; web?: boolean; port?: string; yes?: boolean }

/** runCommand starts a Tao-managed Expo host for an authored React consumer or compiled Tao app. */
export default registerCommand({
  name: 'run',
  description: 'Compile and run a Tao app or an authored TypeScript package in its managed Expo session.',
  arguments: [{ name: 'entry', description: 'Tao app entry file; omit to run the selected TypeScript package.' }],
  options: [
    { flags: '--package <directory>', description: 'Select an authored TypeScript package with tao.run settings.' },
    { flags: '--session <id>', description: 'Use an independent named project session.' },
    { flags: '--web', description: 'Open the web app using the standard Expo interface.' },
    { flags: '--port <port>', description: 'Use this Expo server port.' },
    { flags: '--yes', description: 'Authorize required app or consumer dependency setup.' },
  ],
  async action(entry?: string, options: RunCommandOptions = {}) {
    requireRunPort(options.port)
    if (!entry) {
      const directory = CLIKit.resolveCallerPath(options.package ?? '.')
      await prepareRuntime()
      await Workspace.withConsumerProject(
        directory,
        options.session,
        host => startExpo(host, options),
        workflowUI(options.yes),
      )
      return
    }
    if (options.package) {
      Errors.ThrowUserInput('Use --package for a React consumer, or provide a Tao app entry file.')
    }
    const target = await Workspace.resolveCompileTarget(CLIKit.resolveCallerPath('.'), entry)
    if (target.kind !== 'app') {
      Errors.ThrowUserInput('Run a TypeScript library through its React consumer package with --package.')
    }
    const workspace = await prepareCompiledApplication(target, options.session, options.yes)
    await Try(() => startExpo(workspace.runtime!.directory, options), { finally: () => workspace.dispose() })
  },
})

async function startExpo(directory: string, options: RunCommandOptions): Promise<void> {
  const args = ['--localhost', ...options.web ? ['--web'] : [], ...options.port ? ['--port', options.port] : []]
  const headless = !Terminal.isInteractive()
  const addEnv = headless ? BridgeExpoConfig.HeadlessExpoEnvironment : undefined
  IO.print('Expo host: ' + directory)
  await CLIKit.runForegroundCommand('bun', ['run', 'start', ...args], { cwd: directory, addEnv })
}

function requireRunPort(port?: string): void {
  if (port === undefined) {
    return
  }
  const value = Number(port)
  const isInRange = value >= 1 && value <= 65535
  UserInput.require(Number.isInteger(value) && isInRange, '--port must be an integer between 1 and 65535.')
}
