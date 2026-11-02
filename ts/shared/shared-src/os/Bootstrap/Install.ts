import { EscapeCharacter, NewlineCharacter } from '../../universal/Characters'
import { Buffer as NodeBuffer, hostProcess } from '../bridges/Bridge_node/Bridge_node'
import { appendFileSync, mkdirSync, resolve, spawn, writeFileSync } from '../bridges/Bridge_node/Bridge_node'

/** installWorkspace installs pinned dependencies before loading the normal command graph. */
export async function installWorkspace(completionScript: string): Promise<void> {
  const args = hostProcess.argv.slice(hostProcess.argv[2] === '--agent' ? 3 : 2)
  const logDirectory = resolve('..', '.artifacts', 'logs', 'setup')
  mkdirSync(logDirectory, { recursive: true })
  const logPath = resolve(logDirectory, 'bootstrap.log')
  writeFileSync(logPath, '')
  hostProcess.stderr.write(
    EscapeCharacter + '[90mInstalling workspace dependencies\u2026' + EscapeCharacter + '[0m' + NewlineCharacter,
  )
  const installStatus = await runLogged(['install', ...args], logPath)
  if (installStatus !== 0) {
    hostProcess.stderr.write(`Workspace installation failed. See ${logPath}${NewlineCharacter}`)
    hostProcess.exit(installStatus)
  }
  const completeStatus = await runLogged(['run', completionScript], logPath)
  if (completeStatus !== 0) {
    hostProcess.stderr.write(`Workspace setup completion failed. See ${logPath}${NewlineCharacter}`)
    hostProcess.exit(completeStatus)
  }
  hostProcess.stderr.write(`Workspace dependencies installed. Log: ${logPath}${NewlineCharacter}`)
}

type OutputStream = 'stdout' | 'stderr'

function runLogged(args: string[], logPath: string): Promise<number> {
  appendFileSync(logPath, `${NewlineCharacter}$ bun ${args.join(' ')}${NewlineCharacter}`)
  const child = spawn('bun', args, { stdio: ['inherit', 'pipe', 'pipe'] })
  let lastStream = ''
  const forward = (stream: OutputStream, chunk: NodeBuffer) => {
    if (lastStream !== stream) {
      appendFileSync(logPath, `${NewlineCharacter}[${stream}]${NewlineCharacter}`)
      lastStream = stream
    }
    const output = stream === 'stdout' ? hostProcess.stdout : hostProcess.stderr
    output.write(chunk)
    appendFileSync(logPath, chunk)
  }
  child.stdout.on('data', (chunk: NodeBuffer) => forward('stdout', chunk))
  child.stderr.on('data', (chunk: NodeBuffer) => forward('stderr', chunk))
  return new Promise(resolve => {
    child.once('error', error => {
      hostProcess.stderr.write(`${error.message}${NewlineCharacter}`)
      appendFileSync(logPath, `[spawn error] ${error.message}${NewlineCharacter}`)
      resolve(1)
    })
    child.once('close', status => resolve(status ?? 1))
  })
}
