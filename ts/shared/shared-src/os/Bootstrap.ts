import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

/** installWorkspace installs pinned dependencies before loading the normal command graph. */
export function installWorkspace(): void {
  const arguments_ = process.argv.slice(process.argv[2] === '--agent' ? 3 : 2)
  const logDirectory = resolve('..', '.artifacts', 'logs', 'setup')
  mkdirSync(logDirectory, { recursive: true })
  const logPath = resolve(logDirectory, 'bootstrap.log')
  writeFileSync(logPath, '')
  process.stderr.write('\u001b[90mInstalling workspace dependencies…\u001b[0m\n')
  const installStatus = runLogged(['install', ...arguments_], logPath)
  if (installStatus !== 0) {
    process.stderr.write(`Workspace installation failed. See ${logPath}\n`)
    process.exit(installStatus)
  }
  const completeStatus = runLogged(['run', './CLIs/CLIs-src/dev-cli/commands/_setup-complete.ts'], logPath)
  if (completeStatus !== 0) {
    process.stderr.write(`Workspace setup completion failed. See ${logPath}\n`)
    process.exit(completeStatus)
  }
  process.stderr.write(`Workspace dependencies installed. Log: ${logPath}\n`)
}

function runLogged(arguments_: string[], logPath: string): number {
  const result = spawnSync('bun', arguments_, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
  const stdout = result.stdout ?? ''
  const stderr = [result.stderr, result.error?.message].filter(Boolean).join('\n')
  process.stdout.write(stdout)
  process.stderr.write(stderr)
  writeFileSync(logPath, `${formatOutput(arguments_, stdout, stderr)}`, { flag: 'a' })
  return result.error || result.status === null ? 1 : result.status
}

function formatOutput(arguments_: string[], stdout: string, stderr: string): string {
  return `\n$ bun ${arguments_.join(' ')}\n[stdout]\n${stdout}\n[stderr]\n${stderr}\n`
}
