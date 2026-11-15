import { EscapeCharacter, NewlineCharacter } from '../../../universal/Characters'
import { Buffer as NodeBuffer } from '../../bridges/Bridge_node/Bridge_node'
import { appendFileSync, mkdirSync, resolve, spawn, writeFileSync } from '../../bridges/Bridge_node/Bridge_node'
import * as Process from '../../Process/Process-Current'

/** requireAllowedSetup applies the checkout host allowlist before an agent bootstrap installs anything. */
export function requireAllowedSetup(operations: unknown): void {
  if (!Array.isArray(operations) || !operations.includes('setup')) {
    Process.stderr.write('Host operation setup is not allowlisted.' + NewlineCharacter)
    Process.exit(1)
  }
}

/** installWorkspace installs pinned dependencies before loading the normal command graph. */
export async function installWorkspace(completionScript: string, setupArgs: readonly string[] = []): Promise<void> {
  requireNoSetupArguments(setupArgs)
  const logDirectory = resolve('..', '.artifacts', 'logs', 'setup')
  mkdirSync(logDirectory, { recursive: true })
  const logPath = resolve(logDirectory, 'bootstrap.log')
  writeFileSync(logPath, '')
  Process.stderr.write(
    EscapeCharacter + '[90mInstalling workspace dependencies\u2026' + EscapeCharacter + '[0m' + NewlineCharacter,
  )
  const installStatus = await runLogged(['install', '--frozen-lockfile'], logPath)
  if (installStatus !== 0) {
    Process.stderr.write(`Workspace installation failed. See ${logPath}${NewlineCharacter}`)
    Process.exit(installStatus)
  }
  const completeStatus = await runLogged(['run', completionScript], logPath)
  if (completeStatus !== 0) {
    Process.stderr.write(`Workspace setup completion failed. See ${logPath}${NewlineCharacter}`)
    Process.exit(completeStatus)
  }
  Process.stderr.write(`Workspace dependencies installed. Log: ${logPath}${NewlineCharacter}`)
}

type OutputStream = 'stdout' | 'stderr'

function requireNoSetupArguments(args: readonly string[]): void {
  if (args.length === 0) {
    return
  }
  Process.stderr.write('Setup takes no arguments. Run ./agent unsandboxed setup or ./dev setup.' + NewlineCharacter)
  Process.exit(1)
}

function runLogged(args: string[], logPath: string): Promise<number> {
  appendFileSync(logPath, `${NewlineCharacter}$ bun ${args.join(' ')}${NewlineCharacter}`)
  const child = spawn('bun', args, { stdio: ['inherit', 'pipe', 'pipe'] })
  let lastStream = ''
  const forward = (stream: OutputStream, chunk: NodeBuffer) => {
    if (lastStream !== stream) {
      appendFileSync(logPath, `${NewlineCharacter}[${stream}]${NewlineCharacter}`)
      lastStream = stream
    }
    const output = stream === 'stdout' ? Process.stdout : Process.stderr
    output.write(chunk)
    appendFileSync(logPath, chunk)
  }
  child.stdout.on('data', (chunk: NodeBuffer) => forward('stdout', chunk))
  child.stderr.on('data', (chunk: NodeBuffer) => forward('stderr', chunk))
  return new Promise(resolve => {
    child.once('error', error => {
      Process.stderr.write(`${error.message}${NewlineCharacter}`)
      appendFileSync(logPath, `[spawn error] ${error.message}${NewlineCharacter}`)
      resolve(1)
    })
    child.once('close', status => resolve(status ?? 1))
  })
}
