import type * as Workspace from '@workspace'

import type * as Preview from '@shared/preview'

type PublicationWorkspace =
  & Pick<Workspace.WorkspaceSession, PublicationWorkspaceKey>
  & { files: Pick<Workspace.WorkspaceSession['files'], 'onCompiled'> }

/** PreviewPublication correlates host expectations with the revision actually served by Metro. */
export class PreviewPublication {
  private sequence = 0
  private readonly identities = new Map<string, Preview.PreviewExpectation>()
  private expected?: Preview.PreviewExpectation
  private baseline?: Preview.PreviewExpectation
  private terminal?: Preview.PreviewOutcome
  private readonly stop: (() => unknown)[]

  constructor(
    private readonly workspace: PublicationWorkspace,
    private readonly send: (name: string, data: object) => void,
    onExpected: (revision: string, startedAtMs: number) => void,
    onPublished: (publication: Workspace.Publication) => void,
  ) {
    const initial = workspace.runtime?.generated?.revision ?? workspace.lastGoodRevision
    if (initial) {
      this.expected = this.identify(initial)
      this.baseline = this.expected
    }
    this.stop = [
      workspace.onExpected((revision, startedAtMs) => {
        onExpected(revision, startedAtMs)
        this.expect(revision)
      }),
      workspace.onPublished(publication => {
        onPublished(publication)
        this.published(publication)
      }),
      workspace.files.onCompiled(event => this.compiled(event.result)),
    ]
  }

  readBaseline(): Preview.PreviewExpectation | undefined {
    return this.baseline
  }

  replay(send: (name: string, data: object) => void): void {
    if (this.baseline) {
      send('baseline', this.baseline)
    }
    if (this.expected) {
      send('expected', this.expected)
    }
    if (this.terminal) {
      send('outcome', this.terminal)
    }
  }

  dispose(): void {
    for (const stop of this.stop) {
      stop()
    }
  }

  private identify(revision: string): Preview.PreviewExpectation {
    const known = this.identities.get(revision)
    if (known) {
      return known
    }
    const expectation = { revision, sequence: ++this.sequence }
    this.identities.set(revision, expectation)
    if (this.identities.size > 128) {
      this.identities.delete(this.identities.keys().next().value!)
    }
    return expectation
  }

  private expect(revision: string): Preview.PreviewExpectation {
    this.expected = this.identify(revision)
    this.terminal = undefined
    this.send('expected', this.expected)
    return this.expected
  }

  private published(publication: Workspace.Publication): void {
    const outcome = publication.outcome
    const served = outcome?.publishedRevision ?? publication.revision
    this.baseline = this.identify(served)
    this.send('baseline', this.baseline)
    if (outcome?.status === 'noop') {
      this.finish({ ...this.identify(publication.revision), kind: 'noop' })
    }
  }

  private compiled(result: Workspace.UpdateResult): void {
    if (result.status === 'published') {
      return
    }
    const expectation = this.identities.get(result.revision) ?? this.expect(result.revision)
    if (result.status === 'superseded') {
      this.finish({ ...expectation, kind: 'superseded' })
    } else {
      const served = this.workspace.runtime?.generated?.revision
      if (served) {
        this.baseline = this.identify(served)
        this.send('baseline', this.baseline)
      }
      const message = result.status === 'failed' ? result.error : 'Tao source could not be compiled.'
      this.finish({ ...expectation, kind: 'build-error', message })
    }
  }

  private finish(outcome: Preview.PreviewOutcome): void {
    if (outcome.sequence === this.expected?.sequence) {
      this.terminal = outcome
    }
    this.send('outcome', outcome)
  }
}

type PublicationWorkspaceKey = 'runtime' | 'lastGoodRevision' | 'onExpected' | 'onPublished'
