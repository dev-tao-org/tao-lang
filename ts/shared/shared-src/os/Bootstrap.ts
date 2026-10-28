import { appendFileSync, mkdirSync, resolve, spawn, writeFileSync } from './NodeBuiltins'

/** installWorkspace installs pinned dependencies before loading the normal command graph. */
export async function installWorkspace(completionScript: string): Promise<void> {
  const arguments_ = process.argv.slice(process.argv[2] === '--agent' ? 3 : 2)
  const logDirectory = resolve('..', '.artifacts', 'logs', 'setup')
  mkdirSync(logDirectory, { recursive: true })
  const logPath = resolve(logDirectory, 'bootstrap.log')
  writeFileSync(logPath, '')
  process.stderr.write('\u001b[90mInstalling workspace dependencies…\u001b[0m\n')
  const installStatus = await runLogged(['install', ...arguments_], logPath)
  if (installStatus !== 0) {
    process.stderr.write(`Workspace installation failed. See ${logPath}\n`)
    process.exit(installStatus)
  }
  const completeStatus = await runLogged(['run', completionScript], logPath)
  if (completeStatus !== 0) {
    process.stderr.write(`Workspace setup completion failed. See ${logPath}\n`)
    process.exit(completeStatus)
  }
  process.stderr.write(`Workspace dependencies installed. Log: ${logPath}\n`)
}

type OutputStream = 'stdout' | 'stderr'

function runLogged(arguments_: string[], logPath: string): Promise<number> {
  appendFileSync(logPath, `\n$ bun ${arguments_.join(' ')}\n`)
  const child = spawn('bun', arguments_, { stdio: ['inherit', 'pipe', 'pipe'] })
  let lastStream = ''
  const forward = (stream: OutputStream, chunk: Buffer) => {
    if (lastStream !== stream) {
      appendFileSync(logPath, `\n[${stream}]\n`)
      lastStream = stream
    }
    const output = stream === 'stdout' ? process.stdout : process.stderr
    output.write(chunk)
    appendFileSync(logPath, chunk)
  }
  child.stdout.on('data', (chunk: Buffer) => forward('stdout', chunk))
  child.stderr.on('data', (chunk: Buffer) => forward('stderr', chunk))
  return new Promise(resolve => {
    child.once('error', error => {
      process.stderr.write(`${error.message}\n`)
      appendFileSync(logPath, `[spawn error] ${error.message}\n`)
      resolve(1)
    })
    child.once('close', status => resolve(status ?? 1))
  })
}
