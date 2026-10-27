import * as WebHost from './bridges/Bridge_browser/Bridge_browser'
/** PageState names the small state object exposed to headless preview automation. */
export type PageState = { status: string; currentScenario?: string; results: unknown[]; error?: string }

/** querySelector selects one page element through the browser document. */
export function querySelector<ElementType extends WebHost.Element>(selector: string): ElementType | null {
  return WebHost.browserDocument().querySelector<ElementType>(selector)
}

/** eventStream opens a browser server-sent event stream. */
export function eventStream(url: string): WebHost.EventSource {
  return new WebHost.EventSource(url)
}

/** onMessage subscribes to parent window messages and returns a removal callback. */
export function onMessage(listener: (event: WebHost.MessageEvent) => void): () => void {
  WebHost.browserWindow().addEventListener('message', listener)
  return () => WebHost.browserWindow().removeEventListener('message', listener)
}

/** frameWindow returns the content window used to validate a postMessage source. */
export function frameWindow(frame: WebHost.HTMLIFrameElement): WebHost.Window | null {
  return frame.contentWindow
}

/** requestJson sends a browser request and decodes its JSON response. */
export async function requestJson<Value>(url: string, init?: WebHost.RequestInit): Promise<Value> {
  const response = await WebHost.fetch(url, init)
  return await response.json() as Value
}

/** setPageState exposes current preview progress to the headless browser runner. */
export function setPageState(state: PageState): void {
  WebHost.browserWindow().__taoPreviewState = state
}

/** setStatus updates the visible harness status marker. */
export function setStatus(status: string): void {
  const label = WebHost.browserDocument().querySelector<WebHost.HTMLElement>('#status')
  if (label) {
    label.textContent = status
  }
  WebHost.browserDocument().body.dataset.status = status
}

declare global {
  interface Window {
    __taoPreviewState: PageState
  }
}
