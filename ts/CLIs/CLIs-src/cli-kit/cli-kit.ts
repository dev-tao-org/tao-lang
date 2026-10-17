
/** TUI exposes terminal output methods. */
export const TUI = {
    debug(...args: any[]): void {
        console.debug(...args)
    }
}

/** IO exposes the active CLI output methods. */
export const IO = { ...TUI }

/** setAgentIO switches output to the agent CLI methods. */
export function setAgentIO() {
    Object.assign(IO, agentOI)
}

/** runCommand runs an inherited terminal command and returns its exit code. */
export async function runCommand(command: string[], options: { cwd?: string } = {}): Promise<number> {
    const child = Bun.spawn(command, {
        ...options,
        stdin: 'inherit',
        stdout: 'inherit',
        stderr: 'inherit',
    })
    return await child.exited
}

const agentOI = {
    debug(...args: any[]): void {
        console.debug(...args)
    }
}
