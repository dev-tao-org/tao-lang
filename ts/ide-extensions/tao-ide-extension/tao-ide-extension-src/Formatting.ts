import type * as Fix from '@fix'
import type { vscode } from '../../bridges/Bridge_vscode'

type FormattingProposal = readonly Fix.SourceEdit[] | Promise<readonly Fix.SourceEdit[]>
/** formattingProvider adapts snapshot edits and lazy preparation to VS Code's format-on-save contract. */
export function formattingProvider(
  editor: typeof vscode,
  propose: (document: vscode.TextDocument, indent: number) => FormattingProposal,
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
