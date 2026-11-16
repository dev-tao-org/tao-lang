import { IO } from '@cli-kit'
import { Errors, Try } from '@shared'
import { Platform } from '@shared/os'
import { connectTiming, disconnectTiming, resolveTimingSocket } from './TimingConnection'
import { requireTimingRun, runTiming, type TimingRun } from './TimingRun'

// TimingSessionIO groups the owned SSH lifecycle and delayed report presentation.
type TimingSessionIO = {
  createSocket: (host: string) => string
  connect: typeof connectTiming
  disconnect: typeof disconnectTiming
  run: (request: TimingRun, summary: (message: string) => void) => Promise<void>
  print: (message: string) => void
  warn: (message: string, error: unknown) => void
}

type PendingTimingReport = string | undefined

/** runTimingSession connects, measures and closes its private master before printing the final report. */
export async function runTimingSession(options: TimingRun): Promise<void> {
  const io = createSessionIO()
  requireTimingRun(options)
  if (options.dryRun) {
    await io.run(options, io.print)
    io.print('Would connect with a private session socket, measure, print the report and close the connection.')
    return
  }
  const controlPath = io.createSocket(options.host)
  const request = withSessionSocket(options, controlPath)
  let report: PendingTimingReport
  await Try(async () => {
    await io.connect({ host: options.host, controlPath })
    await io.run(request, message => {
      report = message
    })
  }, {
    finally: (_thrown, error) => closeSession(request, io, error),
  })
  if (report) {
    io.print(report)
  }
}

function createSessionIO(): TimingSessionIO {
  return {
    createSocket: host => resolveTimingSocket(host, Platform.randomUUID()),
    connect: connectTiming,
    disconnect: disconnectTiming,
    run: (request, summary) => runTiming(request, summary),
    print: IO.summary,
    warn: IO.warn,
  }
}

function withSessionSocket(options: TimingRun, controlPath: string): TimingRun {
  return { ...options, controlPath }
}

async function closeSession(request: TimingRun, io: TimingSessionIO, originalError?: Errors.TaoError): Promise<void> {
  await Try(() => io.disconnect({ host: request.host, controlPath: request.controlPath }), {
    catch(error) {
      if (originalError) {
        io.warn('Could not close the session SSH connection after the failed job:', error)
      } else {
        Errors.Throw(error)
      }
    },
  })
}
