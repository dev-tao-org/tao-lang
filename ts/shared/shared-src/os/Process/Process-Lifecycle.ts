import * as WebHost from '../bridges/Bridge_browser/Bridge_browser'
import * as Process from './Process-Current'

/** waitForTermination resolves on a shutdown signal or explicit cancellation and removes its listeners. */
export function waitForTermination(signal?: WebHost.AbortSignal): Promise<void> {
  if (signal?.aborted) {
    return Promise.resolve()
  }
  return new Promise(resolve => {
    const finish = () => {
      Process.off('SIGINT', finish)
      Process.off('SIGTERM', finish)
      signal?.removeEventListener('abort', finish)
      resolve()
    }
    Process.once('SIGINT', finish)
    Process.once('SIGTERM', finish)
    signal?.addEventListener('abort', finish, { once: true })
  })
}

type TerminationSignal = 'SIGINT' | 'SIGTERM'
/** onTermination registers a cooperative shutdown handler and returns its listener cleanup. */
export function onTermination(handler: (signal: TerminationSignal) => void): () => void {
  const interrupt = () => handler('SIGINT')
  const terminate = () => handler('SIGTERM')
  Process.on('SIGINT', interrupt)
  Process.on('SIGTERM', terminate)
  return () => {
    Process.off('SIGINT', interrupt)
    Process.off('SIGTERM', terminate)
  }
}
