import { Errors, nullCharacter, Try } from '@shared'
import type { GeneratedRevision, PublicationOutcome } from './PreviewProtocol'

/** createRevisionOwner retains one active and only the latest pending complete generated revision.
 *  Successful publication includes every server lease, never a preview acknowledgement.
 *  A superseded pending caller receives its own explicit outcome instead of an older result. */
export function createRevisionOwner(
  sessionId: string,
  initial: GeneratedRevision,
  publish: (revision: GeneratedRevision) => Promise<RevisionResult>,
): RevisionOwner {
  const state: RevisionState = {
    sessionId,
    current: snapshotRevision(initial),
    newestSequence: initial.sequence,
    active: false,
    poisoned: false,
    publish,
  }
  return {
    current: () => state.current,
    publish: revision => enqueueRevision(state, snapshotRevision(revision)),
  }
}

/** snapshotRevision validates and copies a complete generated namespace before admission. */
export function snapshotRevision(revision: GeneratedRevision): GeneratedRevision {
  if (!revision.revision || !Number.isSafeInteger(revision.sequence) || revision.sequence < 0) {
    Errors.ThrowUserInput('Generated publication requires an identity and a nonnegative integer sequence.')
  }
  const files: Record<string, string> = Object.create(null)
  for (const [path, text] of Object.entries(revision.files)) {
    const segments = path.split('/')
    const valid = path.length > 0 && !path.includes('\\') && !path.includes(nullCharacter)
      && !segments.some(segment => segment === '' || segment === '.' || segment === '..')
      && segments[0] !== '_gen_runtime' && typeof text === 'string'
    if (!valid) {
      Errors.ThrowUserInput(`Unsupported generated source path: ${path}`)
    }
    files[path] = text
  }
  return Object.freeze({ ...revision, files: Object.freeze(files) })
}

/** RevisionResult identifies whether memory remains committed after an ordinary build error. */
export type RevisionResult = Pick<PublicationOutcome, 'status' | 'message'> & { committed?: boolean }

/** RevisionOwner admits complete revisions while bounding pending work to the latest input. */
export type RevisionOwner = {
  current(): GeneratedRevision
  publish(revision: GeneratedRevision): Promise<PublicationOutcome>
}

type PendingRevision = { revision: GeneratedRevision; resolve(outcome: PublicationOutcome): void }
type RevisionState = {
  sessionId: string
  current: GeneratedRevision
  newestSequence: number
  active: boolean
  poisoned: boolean
  pending?: PendingRevision
  publish(revision: GeneratedRevision): Promise<RevisionResult>
}

function enqueueRevision(state: RevisionState, revision: GeneratedRevision): Promise<PublicationOutcome> {
  if (revision.sequence <= state.newestSequence) {
    return Promise.resolve(createOutcome(state, revision, { status: 'superseded' }))
  }
  state.newestSequence = revision.sequence
  return new Promise(resolve => {
    if (state.pending) {
      state.pending.resolve(createOutcome(state, state.pending.revision, { status: 'superseded' }))
    }
    state.pending = { revision, resolve }
    if (!state.active) {
      void runPending(state)
    }
  })
}

async function runPending(state: RevisionState): Promise<void> {
  state.active = true
  while (state.pending) {
    const request = state.pending
    state.pending = undefined
    const result: RevisionResult = state.poisoned
      ? { status: 'poisoned', message: 'Metro session requires restart.' }
      : await Try(() => state.publish(request.revision), {
        catch: error => ({ status: 'error' as const, message: String(error) }),
      })
    if (result.status === 'published' || result.status === 'error' && result.committed) {
      state.current = request.revision
    }
    state.poisoned ||= result.status === 'poisoned'
    request.resolve(createOutcome(state, request.revision, result))
  }
  state.active = false
}

function createOutcome(state: RevisionState, revision: GeneratedRevision, result: RevisionResult): PublicationOutcome {
  return {
    sessionId: state.sessionId,
    revision: revision.revision,
    sequence: revision.sequence,
    publishedRevision: state.current.revision,
    status: result.status,
    ...(result.message === undefined ? {} : { message: result.message }),
  }
}
