import type { SourceEdit } from '@fix/Format'
import type * as vscode from 'vscode'

/** formattingProvider adapts snapshot edits and lazy preparation to VS Code's format-on-save contract. */
export function formattingProvider(
  editor: typeof vscode,
  propose: (document: vscode.TextDocument, indent: number) => readonly SourceEdit[] | Promise<readonly SourceEdit[]>,
): vscode.DocumentFormattingEditProvider {
  return {
    async provideDocumentFormattingEdits(document, options, cancellation) {
      const version = document.version
      const edits = await propose(document, options.tabSize)
      if (cancellation.isCancellationRequested || version !== document.version) {
        return []
      }
      return edits.map(edit =>
        editor.TextEdit.replace(
          new editor.Range(document.positionAt(edit.range.start), document.positionAt(edit.range.end)),
          edit.text,
        )
      )
    },
  }
}
