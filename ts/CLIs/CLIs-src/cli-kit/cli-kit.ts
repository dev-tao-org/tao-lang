/** TUI exposes terminal output methods. */
export const TUI = {
  debug(...args: any[]): void {
    console.debug(...args)
  },
}

/** IO exposes the active CLI output methods. */
export const IO = { ...TUI }

/** setAgentIO switches output to the agent CLI methods. */
export function setAgentIO() {
  Object.assign(IO, agentOI)
}

/** runCommand runs an inherited terminal command and returns its exit code. */
export async function runCommand(command: string[], options: {
  cwd?: string
  stdout?: 'inherit' | 'ignore'
  stderr?: 'inherit' | 'ignore'
} = {}): Promise<number> {
  const child = Bun.spawn(command, {
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit',
    ...options,
  })
  return await child.exited
}

/** runSteps runs workflow stages in order and returns the first failing exit status. */
export async function runSteps(steps: readonly (() => Promise<number>)[]): Promise<number> {
  for (const step of steps) {
    const exitCode = await step()
    if (exitCode !== 0) {
      return exitCode
    }
  }
  return 0
}

const agentOI = {
  debug(...args: any[]): void {
    console.debug(...args)
  },
}
