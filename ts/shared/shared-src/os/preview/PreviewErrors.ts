import * as Styles from '../../universal/Styles'

/** showPreviewError retains a visible diagnostic and explicit manual recovery action. */
export function showPreviewError(message: string, onReload: () => void): void {
  if (typeof document === 'undefined') {
    return
  }
  const panel = document.getElementById('tao-preview-error') ?? createErrorPanel()
  const text = panel.querySelector('pre')!
  panel.querySelector('button')!.onclick = onReload
  text.textContent = message
  panel.hidden = false
}

/** clearPreviewError hides the current error after a real corrected commit. */
export function clearPreviewError(): void {
  const panel = typeof document === 'undefined' ? null : document.getElementById('tao-preview-error')
  if (panel) {
    panel.hidden = true
  }
}

function createErrorPanel(): HTMLElement {
  const panel = document.createElement('aside')
  panel.id = 'tao-preview-error'
  panel.setAttribute('role', 'alert')
  panel.style.cssText = Styles.declarations({
    'position': 'fixed',
    'inset': '12px',
    'z-index': '2147483647',
    'background': '#292020',
    'color': '#fff',
    'padding': '16px',
    'overflow': 'auto',
    'font': '14px system-ui',
    'border': '1px solid #b66',
  })
  const text = document.createElement('pre')
  text.style.cssText = Styles.declarations({ 'white-space': 'pre-wrap', 'overflow-wrap': 'anywhere' })
  const reload = document.createElement('button')
  reload.textContent = 'Reload'
  panel.append(text, reload)
  ;(document.body ?? document.documentElement).append(panel)
  return panel
}
