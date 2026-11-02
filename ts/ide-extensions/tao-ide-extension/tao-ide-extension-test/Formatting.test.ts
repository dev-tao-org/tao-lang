import { Range } from '@shared'
import { Tests } from '@shared/os'
import type { vscode } from '../../bridges/Bridge_vscode'
import { formattingProvider } from '../tao-ide-extension-src/Formatting'

Tests.test('editor formatting returns range edits and discards results for a changed document version', async () => {
  const editor = {
    TextEdit: { replace: (range: unknown, newText: string) => ({ range, newText }) },
    Range: class {
      constructor(readonly start: number, readonly end: number) {}
    },
  } as unknown as typeof vscode
  const snapshot = { version: 1, positionAt: (offset: number) => offset }
  const document = snapshot as unknown as vscode.TextDocument
  let changeVersion = false
  const provider = formattingProvider(editor, async () => {
    await Promise.resolve()
    if (changeVersion) {
      snapshot.version++
    }
    return [{ range: Range(3, 5), text: ' ' }]
  })
  const options = { tabSize: 2, insertSpaces: true }
  const cancellation = { isCancellationRequested: false } as vscode.CancellationToken
  const edits = await provider.provideDocumentFormattingEdits(document, options, cancellation) as vscode.TextEdit[]
  Tests.expect(edits?.length).toBe(1)
  Tests.expect(edits?.[0]?.newText).toBe(' ')
  const range = edits?.[0]?.range as unknown as { start: number; end: number }
  Tests.expect(range.start).toBe(3)
  Tests.expect(range.end).toBe(5)
  changeVersion = true
  Tests.expect(await provider.provideDocumentFormattingEdits(document, options, cancellation)).toEqual([])
})
