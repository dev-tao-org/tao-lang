/** PageState names the small state object exposed to headless preview automation. */
export type PageState = { status: string; currentScenario?: string; results: unknown[]; error?: string }

/** querySelector selects one page element through the browser document. */
export function querySelector<ElementType extends Element>(selector: string): ElementType | null {
  return document.querySelector<ElementType>(selector)
}

/** eventStream opens a browser server-sent event stream. */
export function eventStream(url: string): EventSource {
  return new EventSource(url)
}

/** onMessage subscribes to parent window messages and returns a removal callback. */
export function onMessage(listener: (event: MessageEvent) => void): () => void {
  window.addEventListener('message', listener)
  return () => window.removeEventListener('message', listener)
}

/** frameWindow returns the content window used to validate a postMessage source. */
export function frameWindow(frame: HTMLIFrameElement): Window | null {
  return frame.contentWindow
}

/** requestJson sends a browser request and decodes its JSON response. */
export async function requestJson<Value>(url: string, init?: RequestInit): Promise<Value> {
  const response = await fetch(url, init)
  return await response.json() as Value
}

/** setPageState exposes current preview progress to the headless browser runner. */
export function setPageState(state: PageState): void {
  window.__taoPreviewState = state
}

/** setStatus updates the visible harness status marker. */
export function setStatus(status: string): void {
  const label = document.querySelector<HTMLElement>('#status')
  if (label) {
    label.textContent = status
  }
  document.body.dataset.status = status
}

declare global {
  interface Window {
    __taoPreviewState: PageState
  }
}
