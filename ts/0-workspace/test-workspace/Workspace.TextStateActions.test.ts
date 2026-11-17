import { S, Try } from '@shared'
import * as Tests from '@shared-tests'
import * as Workspace from '../workspace-src/Workspace'

Tests.test('invalid text writes and event handlers are rejected before app generation', async () => {
  const workspace = Workspace.createWorkspace({})
  await Try(async () => {
    await expectRejection(
      workspace,
      'action Edit(Fixed text) { set Fixed = "New" }',
      'render Text(Fixed)',
      'Cannot set Fixed: it is not writable state.',
    )
    await expectRejection(
      workspace,
      'action Edit(Value text) { set Status = Value }',
      'render Button(Status) { on press Edit }',
      'Edit expects 1 action arguments; got 0.',
    )
    await expectRejection(
      workspace,
      'action Edit() { set Status = Button }',
      'render Text(Status)',
      'Expected a text value.',
    )
    await expectRejection(
      workspace,
      'action Edit() { do Fixed() }',
      'render Text(Status)',
      'Fixed is not a visible action.',
    )
    await expectRejection(
      workspace,
      'action Edit() { set Status = "New" }',
      'render Text(Status) { on press Edit }',
      'This view does not accept on press.',
    )
    await expectRejection(
      workspace,
      '',
      'render Status',
      'Status is text and cannot be rendered as a view.',
    )
  }, { finally: () => workspace.dispose() })
})

async function expectRejection(
  workspace: Workspace.WorkspaceSession,
  action: string,
  render: string,
  message: string,
): Promise<void> {
  const source = S`
    use tao@ui Button, Text
    app Example { root Main }
    view Main {
      state Status = "Old"
      let Fixed = "Fixed"
      ${action}
      ${render}
    }
  `
  const result = await workspace.update(source)
  Tests.expect(result.status).toBe('failed')
  Tests.expect(result.status === 'failed' && result.error).toContain(message)
  Tests.expect(workspace.lastGoodRevision).toBeUndefined()
}
