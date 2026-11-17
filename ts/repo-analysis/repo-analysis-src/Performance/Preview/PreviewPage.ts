import * as Client from '@runtime/client'
import { Json, S, Styles } from '@shared'

type PreviewPageOptions = {
  sessionId: string
  scenarios: readonly string[]
  eager: boolean
  previewTimeoutMs?: number
  frameCount?: number
  editor: boolean
}

/** previewPage renders the preview harness shell and optional performance editor. */
export function previewPage({
  sessionId,
  scenarios,
  eager,
  previewTimeoutMs = 10_000,
  frameCount = 2,
  editor,
}: PreviewPageOptions): string {
  const safe = (value: string) => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;')
  const rightFrame = frameCount === 2 ? '<iframe id="right" title="Wide preview" hidden></iframe>' : ''
  const columns = frameCount === 2 ? '380px minmax(600px,1fr)' : 'minmax(380px,1fr)'
  const styleText = createPreviewPageStyles(editor ? `260px ${columns}` : columns)
  return S`
    <!doctype html><html><head><meta charset="utf-8"><meta name="tao-preview-timeout-ms" content="${previewTimeoutMs}"><link rel="icon" href="/favicon-white.svg" media="(prefers-color-scheme: dark)"><link rel="icon" href="/favicon-dark.svg" media="(prefers-color-scheme: light)"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="tao-session" content="${
    safe(sessionId)
  }"><meta name="tao-scenarios" content="${
    safe(serializePreviewScenariosMetadata(scenarios))
  }"><title>Tao preview performance</title><style>${styleText}</style></head><body data-open-on-load="${eager}"><header><button id="open" disabled>Show previews</button><button id="run" disabled>Run edit scenarios</button><span id="status">starting</span></header><main>${
    editor ? EditorMarkup : ''
  }<iframe id="left" title="Narrow preview" hidden></iframe>${rightFrame}</main><script type="module" src="/preview-browser.js"></script></body></html>
  `
}

const EditorMarkup = S`
  <section id="source-editor" aria-label="Performance source editor">
    <nav aria-label="Project files">
      <strong>Project files</strong>
      <ul id="source-files"></ul>
    </nav>
    <div id="source-pane">
      <label for="source-text" id="source-name">Source</label>
      <textarea id="source-text" spellcheck="false" disabled></textarea>
      <div id="source-actions"><button type="button" id="save-source" disabled>Save</button><output id="source-status" aria-live="polite"></output></div>
    </div>
  </section>
`

function createPreviewPageStyles(columns: string): string {
  return Styles.stylesheet({
    'html,body': {
      'height': '100%',
      'margin': '0',
      'font': '14px system-ui',
      'color': '#e8e6e3',
      'background': '#202020',
      'color-scheme': 'dark',
    },
    'header': { 'height': '44px', 'display': 'flex', 'align-items': 'center', 'gap': '12px', 'padding': '0 12px' },
    'button': {
      'font': 'inherit',
      'color': 'inherit',
      'background': '#333',
      'border': '1px solid #555',
      'border-radius': '4px',
      'padding': '5px 10px',
    },
    'button:hover': { 'background': '#404040' },
    'button:disabled': { 'color': '#a8a6a3' },
    'main': {
      'height': 'calc(100% - 44px)',
      'display': 'grid',
      'grid-template-columns': columns,
      'gap': '1px',
      'background': '#484848',
    },
    'iframe': {
      'width': '100%',
      'height': '100%',
      'border': '0',
      'background': Client.DefaultAppearance.background,
      'outline': `1px solid ${Client.DefaultAppearance.border}`,
      'outline-offset': '-1px',
    },
    ...EditorStyles,
  })
}

const EditorStyles = {
  '#source-editor': {
    'display': 'grid',
    'grid-template-rows': 'minmax(90px, 28%) minmax(0, 1fr)',
    'min-height': '0',
    'background': '#202020',
  },
  '#source-editor nav': { 'overflow': 'auto', 'padding': '10px', 'border-bottom': '1px solid #454545' },
  '#source-files': { 'list-style': 'none', 'padding': '0', 'margin': '6px 0 0' },
  '#source-files button': { 'width': '100%', 'text-align': 'left', 'border': '0', 'background': 'transparent' },
  '#source-files button[aria-current="true"]': { 'background': '#394154' },
  '#source-pane': {
    'display': 'grid',
    'grid-template-rows': 'auto minmax(0, 1fr) auto',
    'min-height': '0',
    'padding': '10px',
    'gap': '7px',
  },
  '#source-text': {
    'resize': 'none',
    'min-width': '0',
    'font': '13px/1.45 monospace',
    'color': 'inherit',
    'background': '#171717',
    'border': '1px solid #505050',
    'padding': '8px',
  },
  '#source-actions': { 'display': 'flex', 'align-items': 'center', 'gap': '8px' },
}

function serializePreviewScenariosMetadata(scenarios: readonly string[]): string {
  return Json.Print(scenarios)
}
