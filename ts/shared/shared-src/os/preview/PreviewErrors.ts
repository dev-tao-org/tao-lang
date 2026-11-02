import * as WebHost from '../bridges/Bridge_browser/Bridge_browser'
/** showPreviewError retains a visible diagnostic and explicit manual recovery action. */
export function showPreviewError(message: string, onReload: () => void): void {
  if (!WebHost.hasDocument()) {
    return
  }
  const panel = WebHost.getBrowserDocument().getElementById('tao-preview-error') ?? createErrorPanel()
  const text = panel.querySelector('pre')!
  panel.querySelector('button')!.onclick = onReload
  text.textContent = message
  panel.hidden = false
}

/** clearPreviewError hides the current error after a real corrected commit. */
export function clearPreviewError(): void {
  const panel = !WebHost.hasDocument() ? null : WebHost.getBrowserDocument().getElementById('tao-preview-error')
  if (panel) {
    panel.hidden = true
  }
}

function createErrorPanel(): WebHost.HTMLElement {
  const panel = WebHost.getBrowserDocument().createElement('aside')
  panel.id = 'tao-preview-error'
  panel.setAttribute('role', 'alert')
  panel.style.cssText =
    'position:fixed;inset:12px;z-index:2147483647;background:#292020;color:#fff;padding:16px;overflow:auto;font:14px system-ui;border:1px solid #b66'
  const text = WebHost.getBrowserDocument().createElement('pre')
  text.style.cssText = 'white-space:pre-wrap;overflow-wrap:anywhere'
  const reload = WebHost.getBrowserDocument().createElement('button')
  reload.textContent = 'Reload'
  panel.append(text, reload)
  ;(WebHost.getBrowserDocument().body ?? WebHost.getBrowserDocument().documentElement).append(panel)
  return panel
}
