import { NewlineCharacter } from '../../universal/Characters'
import * as PreviewOutcomeTrackerModule2 from '../../universal/PreviewOutcomeTracker'
import * as Styles from '../../universal/Styles'
import * as Time from '../../universal/Time'
import * as Http from '../../web/net/Http'
import * as WebHost from '../bridges/Bridge_browser/Bridge_browser'

type PreviewControlSignal = PreviewOutcomeTrackerModule2.PreviewIdentity & {
  type: string
  revision?: string
  connected?: boolean
  kind?: string
  message?: string
}

/** PreviewRecovery owns bounded acknowledgement recovery for one iframe. */
export class PreviewRecovery {
  private readonly tracker: PreviewOutcomeTrackerModule2.PreviewOutcomeTracker
  private readonly expectations = new Map<string, PreviewOutcomeTrackerModule2.PreviewExpectation>()
  private readonly panel: WebHost.HTMLElement
  private bootId = ''
  private latest?: PreviewOutcomeTrackerModule2.PreviewExpectation
  private baseline?: PreviewOutcomeTrackerModule2.PreviewExpectation
  private cancelTimer?: () => void
  private disposed = false
  private readonly onPageHide = () => this.dispose()

  constructor(
    private readonly frame: WebHost.HTMLIFrameElement,
    initialUrl: string,
    sessionId: string,
    frameId: string,
    timeoutMs = 10_000,
  ) {
    this.tracker = new PreviewOutcomeTrackerModule2.PreviewOutcomeTracker(sessionId, frameId, timeoutMs)
    this.panel = createRecoveryPanel(() => this.reload(true))
    WebHost.getBrowserWindow().addEventListener('pagehide', this.onPageHide, { once: true })
    this.reload(false, initialUrl)
  }

  expect(expectation: PreviewOutcomeTrackerModule2.PreviewExpectation): void {
    this.latest = expectation
    this.expectations.set(expectation.revision, expectation)
    if (this.expectations.size > PreviewOutcomeTrackerModule2.previewExpectationCapacity) {
      this.expectations.delete(this.expectations.keys().next().value!)
    }
    this.tracker.expect(expectation, Time.nowMs())
    this.scheduleDeadline()
    this.render()
  }

  receive(
    identity: PreviewOutcomeTrackerModule2.PreviewIdentity,
    revision: string,
    kind: PreviewOutcomeTrackerModule2.PreviewOutcome['kind'],
    message?: string,
  ): boolean {
    const expectation = this.expectations.get(revision)
    if (!expectation || !this.tracker.receive(identity, { ...expectation, kind, message })) {
      return false
    }
    this.scheduleDeadline()
    this.render()
    return true
  }

  terminal(outcome: PreviewOutcomeTrackerModule2.PreviewOutcome): void {
    this.tracker.terminal(outcome)
    this.scheduleDeadline()
    this.render()
  }

  setBaseline(baseline: PreviewOutcomeTrackerModule2.PreviewExpectation): void {
    this.baseline = baseline
    this.expectations.set(baseline.revision, baseline)
  }

  reportError(message: string): void {
    this.tracker.reportError(message)
    this.scheduleDeadline()
    this.render()
  }

  manualReload(): void {
    this.reload(true)
  }

  matchesInstance(bootId: string): boolean {
    return bootId === this.bootId
  }

  receiveControlSignal(signal: PreviewControlSignal): boolean {
    if (signal.type === 'tao.preview-connection') {
      this.reportConnection(signal.connected === true)
    } else if (signal.type === 'tao.preview-error') {
      const received = signal.kind === 'runtime-error' && signal.revision
        ? this.receive(signal, signal.revision, 'runtime-error', signal.message)
        : false
      if (!received) {
        this.reportError(signal.message ?? 'Preview failed. Reload to recover.')
      }
    } else if (signal.type === 'tao.preview-reload') {
      this.manualReload()
    } else {
      return false
    }
    return true
  }

  reportConnection(connected: boolean): void {
    if (!connected && this.latest) {
      this.tracker.terminal({
        ...this.latest,
        kind: 'disconnected',
        message: 'Metro disconnected. Reload to reconnect.',
      })
      this.scheduleDeadline()
      this.render()
    }
  }

  dispose(): void {
    this.disposed = true
    WebHost.getBrowserWindow().removeEventListener('pagehide', this.onPageHide)
    this.cancelTimer?.()
    this.panel.remove()
  }

  private reload(manual: boolean, initialUrl = this.frame.src): void {
    if (manual) {
      this.tracker.manualRecovery()
    }
    this.bootId = WebHost.crypto.randomUUID()
    this.tracker.bindInstance(this.bootId)
    const url = Http.url(initialUrl)
    url.searchParams.set('bootId', this.bootId)
    this.frame.src = url.toString()
    const expectation = this.baseline ?? this.latest
    if (expectation) {
      this.expectations.set(expectation.revision, expectation)
      this.tracker.expect(expectation, Time.nowMs())
    }
    this.scheduleDeadline()
    this.render()
  }

  private scheduleDeadline(): void {
    this.cancelTimer?.()
    const deadline = this.tracker.snapshot().deadline
    if (deadline === undefined) {
      return
    }
    this.cancelTimer = Time.schedule(Math.max(0, deadline - Time.nowMs()), () => {
      if (this.disposed) {
        return
      }
      const action = this.tracker.checkDeadline(Time.nowMs())
      if (action === 'reload') {
        this.reload(false)
      } else {
        this.render()
      }
    })
  }

  private render(): void {
    const snapshot = this.tracker.snapshot()
    this.panel.hidden = !snapshot.error
    this.panel.querySelector('pre')!.textContent = snapshot.diagnostics.join(NewlineCharacter.repeat(2))
    const bounds = this.frame.getBoundingClientRect()
    this.panel.style.left = `${bounds.left + 8}px`
    this.panel.style.top = `${bounds.top + 8}px`
    this.panel.style.width = `${Math.max(100, bounds.width - 48)}px`
  }
}

function createRecoveryPanel(reload: () => void): WebHost.HTMLElement {
  const panel = WebHost.getBrowserDocument().createElement('aside')
  panel.setAttribute('role', 'alert')
  panel.style.cssText = Styles.declarations({
    'position': 'fixed',
    'z-index': '100',
    'background': '#292020',
    'color': 'white',
    'padding': '16px',
    'border': '1px solid #b66',
    'max-height': '60vh',
    'overflow': 'auto',
  })
  const text = WebHost.getBrowserDocument().createElement('pre')
  text.style.cssText = Styles.declarations({ 'white-space': 'pre-wrap', 'overflow-wrap': 'anywhere' })
  const button = WebHost.getBrowserDocument().createElement('button')
  button.textContent = 'Reload'
  button.onclick = reload
  panel.append(text, button)
  WebHost.getBrowserDocument().body.append(panel)
  return panel
}
