import { Time } from '@shared'
import { Artifacts, Path, Platform, Repo, Terminal } from '@shared/os'
import type { OutputEvent } from './Output'

/** createFileOutput retains original streams independently from terminal presentation. */
export function createFileOutput(options: { logDirectory?: 'agent' | 'dev'; logFile?: string }) {
  const path = options.logFile ? Repo.resolvePath(options.logFile) : Artifacts.resolvePath(
    'logs',
    options.logDirectory ?? 'dev',
    `${Time.date().toISOString().replaceAll(':', '-')}-${Platform.pid}.log`,
  )
  let opened = false
  return (event: OutputEvent): void => {
    if (!opened) {
      opened = true
      Artifacts.mkdirSync(Path.dirname(path), { recursive: true })
      Artifacts.trackTemporary(path)
      const announcement = `Logs: ${Path.relative(Repo.getWorkspaceRoot(), path)}\n`
      Artifacts.appendFileSync(path, announcement)
      Terminal.stderr.write(announcement)
    }
    Artifacts.appendFileSync(path, event.main ? event.text : `[${event.channel.title}] ${event.text}`)
  }
}
