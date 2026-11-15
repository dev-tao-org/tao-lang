import { Errors, Time, Try } from '@shared'
import { Cancellation, Http } from '@shared/web'
import { serializeGeneratedRevision, snapshotRevision } from '../GeneratedRevision'
import type { GeneratedRevision, PublicationOutcome } from '../PreviewProtocol'

/** createPublicationTransport faults a session permanently when server commit completion becomes unknown.
 *  The deadline concerns Metro server completion, independently of preview acknowledgement deadlines.
 *  Disposal and timeout settle callers even when the request implementation ignores cancellation. */
export function createPublicationTransport(
  sessionId: string,
  token: string,
  initialRevision: string,
  request: typeof Http.request = Http.request,
  timeoutMs = 30_000,
): PublicationTransport {
  const state: TransportState = {
    sessionId,
    token,
    publishedRevision: initialRevision,
    publishedSequence: -1,
    request,
    timeoutMs,
    aborters: new Set(),
  }
  return {
    publish: (url, revision) => publishRevision(state, url, snapshotRevision(revision)),
    dispose() {
      faultTransport(state, 'Metro session was disposed; restart the session before publishing again.')
    },
  }
}

/** PublicationTransport sends one session's bounded complete-revision requests. */
export type PublicationTransport = {
  publish(url: string, revision: GeneratedRevision): Promise<PublicationOutcome>
  dispose(): void
}
type TransportState = {
  sessionId: string
  token: string
  publishedRevision: string
  publishedSequence: number
  request: typeof Http.request
  timeoutMs: number
  aborters: Set<() => void>
  fault?: string
}

async function publishRevision(
  state: TransportState,
  url: string,
  revision: GeneratedRevision,
): Promise<PublicationOutcome> {
  if (state.fault) {
    return createPoisonedOutcome(state, revision)
  }
  const controller = Cancellation.createController()
  let interrupt!: () => void
  const stopped = new Promise<PublicationOutcome>(resolve => {
    interrupt = () => {
      controller.abort()
      resolve(createPoisonedOutcome(state, revision))
    }
  })
  state.aborters.add(interrupt)
  const cancelDeadline = Time.schedule(state.timeoutMs, () => {
    faultTransport(state, 'Metro publication timed out; server commit state is unknown. Restart the Metro session.')
  })
  return await Try(async () => {
    const operation = requestRevision(state, url, revision, controller.signal)
    return await Promise.race([operation, stopped])
  }, {
    finally() {
      cancelDeadline()
      state.aborters.delete(interrupt)
    },
  })
}

async function requestRevision(
  state: TransportState,
  url: string,
  revision: GeneratedRevision,
  signal: AbortSignal,
): Promise<PublicationOutcome> {
  return await Try(async () => {
    const response = await state.request(`${url}/__tao/publish`, {
      method: 'POST',
      headers: { 'authorization': `Bearer ${state.token}`, 'content-type': 'application/json' },
      body: serializeGeneratedRevision(revision),
      signal,
    })
    if (!response.ok) {
      Errors.ThrowHostEnvironment(`Metro publication failed (${response.status}): ${await response.text()}`)
    }
    const outcome = await response.json() as PublicationOutcome
    if (state.fault) {
      return createPoisonedOutcome(state, revision)
    }
    assertOutcome(state, revision, outcome)
    retainServedIdentity(state, revision, outcome)
    if (outcome.status === 'poisoned') {
      faultTransport(state, outcome.message ?? 'Metro session requires restart.')
    }
    return outcome
  }, {
    catch(error) {
      faultTransport(state, `Metro publication completion is unknown; restart the session. ${String(error)}`)
      return createPoisonedOutcome(state, revision)
    },
  })
}

function assertOutcome(state: TransportState, revision: GeneratedRevision, outcome: PublicationOutcome): void {
  if (!isMatchingPublicationOutcome(state, revision, outcome)) {
    Errors.ThrowHostEnvironment('Metro returned an invalid publication identity or terminal outcome.')
  }
}

function isMatchingPublicationOutcome(
  state: TransportState,
  revision: GeneratedRevision,
  outcome: PublicationOutcome,
): boolean {
  return identifiesPublication(outcome, state, revision) && hasPublishedRevision(outcome)
    && isTerminalPublicationStatus(outcome.status)
}

function identifiesPublication(
  outcome: PublicationOutcome,
  state: TransportState,
  revision: GeneratedRevision,
): boolean {
  return outcome.sessionId === state.sessionId && outcome.revision === revision.revision
    && outcome.sequence === revision.sequence
}

function hasPublishedRevision(outcome: PublicationOutcome): boolean {
  return typeof outcome.publishedRevision === 'string'
}

function isTerminalPublicationStatus(status: PublicationOutcome['status']): boolean {
  return ['published', 'noop', 'superseded', 'error', 'poisoned'].includes(status)
}

function retainServedIdentity(state: TransportState, revision: GeneratedRevision, outcome: PublicationOutcome): void {
  if (outcome.publishedRevision === revision.revision && revision.sequence > state.publishedSequence) {
    state.publishedRevision = revision.revision
    state.publishedSequence = revision.sequence
  }
}

function createPoisonedOutcome(state: TransportState, revision: GeneratedRevision): PublicationOutcome {
  return {
    sessionId: state.sessionId,
    revision: revision.revision,
    sequence: revision.sequence,
    status: 'poisoned',
    publishedRevision: state.publishedRevision,
    message: state.fault,
  }
}

function faultTransport(state: TransportState, message: string): void {
  state.fault ??= message
  for (const abort of state.aborters) {
    abort()
  }
}
