import * as WebHost from './bridges/Bridge_browser/Bridge_browser'
/** PageState names the small state object exposed to headless preview automation. */
export type PageState = {
  status: string
  currentScenario?: string
  results: unknown[]
  error?: string
  previewOpenMs?: number
}

/** querySelector selects one page element through the browser document. */
export function querySelector<ElementType extends WebHost.Element>(selector: string): ElementType | null {
  return WebHost.getBrowserDocument().querySelector<ElementType>(selector)
}

/** onMessage subscribes to parent window messages and returns a removal callback. */
export function onMessage(listener: (event: WebHost.MessageEvent) => void): () => void {
  WebHost.getBrowserWindow().addEventListener('message', listener)
  return () => WebHost.getBrowserWindow().removeEventListener('message', listener)
}

/** frameWindow returns the content window used to validate a postMessage source. */
export function frameWindow(frame: WebHost.HTMLIFrameElement): WebHost.Window | null {
  return frame.contentWindow
}

/** setPageState exposes current preview progress to the headless browser runner. */
export function setPageState(state: PageState): void {
  WebHost.getBrowserWindow().__taoPreviewState = state
}

/** setStatus updates the visible harness status marker. */
export function setStatus(status: string): void {
  const label = WebHost.getBrowserDocument().querySelector<WebHost.HTMLElement>('#status')
  if (label) {
    label.textContent = status
  }
  WebHost.getBrowserDocument().body.dataset.status = status
}

declare global {
  interface Window {
    __taoPreviewState: PageState
  }
}
