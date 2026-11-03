import { NewlineCharacter, Time } from '@shared'
import { Artifacts, Path, Platform, Repo } from '@shared/os'
import type { OutputEvent } from './Output'

type LogDirectory = 'agent' | 'dev'
/** createFileOutput retains original streams independently from terminal presentation. */
export function createFileOutput(
  options: { logDirectory?: LogDirectory; logFile?: string },
  announce: (message: string) => void,
) {
  const path = options.logFile ? Repo.resolvePath(options.logFile) : Artifacts.resolvePath(
    'logs',
    options.logDirectory ?? 'dev',
    `${Time.date().toISOString().replaceAll(':', '-')}-${Platform.pid}.log`,
  )
  let opened = false
  return Object.assign(write, { path })

  function write(event: OutputEvent): void {
    if (!opened) {
      opened = true
      Artifacts.mkdirSync(Path.dirname(path), { recursive: true })
      Artifacts.trackTemporary(path)
      const announcement = `Logs: ${Path.relative(Repo.getWorkspaceRoot(), path)}${NewlineCharacter}`
      Artifacts.appendFileSync(path, announcement)
      announce(announcement)
    }
    const channel = event.main ? '' : `[${event.channel.title}] `
    Artifacts.appendFileSync(path, `[${event.level} ${event.stream}] ${channel}${event.text}`)
  }
}
