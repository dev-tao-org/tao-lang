import type { SourceEdit } from '@fix/Format'
import type * as vscode from 'vscode'

/** formattingProvider adapts synchronous snapshot edits to VS Code's format-on-save contract. */
export function formattingProvider(
  editor: typeof vscode,
  propose: (document: vscode.TextDocument, indent: number) => readonly SourceEdit[],
): vscode.DocumentFormattingEditProvider {
  return {
    provideDocumentFormattingEdits(document, options, cancellation) {
      const version = document.version
      const edits = propose(document, options.tabSize)
      if (cancellation.isCancellationRequested || version !== document.version) {
        return []
      }
      return edits.map(edit =>
        editor.TextEdit.replace(
          new editor.Range(document.positionAt(edit.start), document.positionAt(edit.end)),
          edit.text,
        )
      )
    },
  }
}
