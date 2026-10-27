import { Buffer as NodeBuffer, hostProcess } from './bridges/Bridge_node/Bridge_node'
import { appendFileSync, mkdirSync, resolve, spawn, writeFileSync } from './bridges/Bridge_node/Bridge_node'

/** installWorkspace installs pinned dependencies before loading the normal command graph. */
export async function installWorkspace(completionScript: string): Promise<void> {
  const arguments_ = hostProcess.argv.slice(hostProcess.argv[2] === '--agent' ? 3 : 2)
  const logDirectory = resolve('..', '.artifacts', 'logs', 'setup')
  mkdirSync(logDirectory, { recursive: true })
  const logPath = resolve(logDirectory, 'bootstrap.log')
  writeFileSync(logPath, '')
  hostProcess.stderr.write('\u001b[90mInstalling workspace dependencies…\u001b[0m\n')
  const installStatus = await runLogged(['install', ...arguments_], logPath)
  if (installStatus !== 0) {
    hostProcess.stderr.write(`Workspace installation failed. See ${logPath}\n`)
    hostProcess.exit(installStatus)
  }
  const completeStatus = await runLogged(['run', completionScript], logPath)
  if (completeStatus !== 0) {
    hostProcess.stderr.write(`Workspace setup completion failed. See ${logPath}\n`)
    hostProcess.exit(completeStatus)
  }
  hostProcess.stderr.write(`Workspace dependencies installed. Log: ${logPath}\n`)
}

function runLogged(arguments_: string[], logPath: string): Promise<number> {
  appendFileSync(logPath, `\n$ bun ${arguments_.join(' ')}\n`)
  const child = spawn('bun', arguments_, { stdio: ['inherit', 'pipe', 'pipe'] })
  let lastStream = ''
  const forward = (stream: 'stdout' | 'stderr', chunk: NodeBuffer) => {
    if (lastStream !== stream) {
      appendFileSync(logPath, `\n[${stream}]\n`)
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
      hostProcess.stderr.write(`${error.message}\n`)
      appendFileSync(logPath, `[spawn error] ${error.message}\n`)
      resolve(1)
    })
    child.once('close', status => resolve(status ?? 1))
  })
}
