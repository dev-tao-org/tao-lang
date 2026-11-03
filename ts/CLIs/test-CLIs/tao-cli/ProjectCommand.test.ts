import { Try } from '@shared'
import * as Tests from '@shared-tests'
import { Artifacts, FS, Path, Platform } from '@shared/os'
import * as Workspace from '@workspace'
import * as WorkspaceTests from '@workspace/testing'

import { withProjectSessions } from '../../CLIs-src/tao-cli/ProjectCommand'

const SidecarFailureOutputRegx = /Sidecar tests failed.*test output/

Tests.test('project command sessions acquire distinct projects in stable order and release all leases', async () => {
  const first = tempProject('first')
  const second = tempProject('second')
  const acquired: string[] = []
  const released: string[] = []
  await Try(async () => {
    await Workspace.initializeProject(first)
    await Workspace.initializeProject(second)
    const result = await withProjectSessions(
      [Path.join(second, 'Main.tao'), Path.join(first, 'Main.tao')],
      async () => 'done',
      'editor-session',
      async identity => {
        acquired.push(identity)
        return () => {
          released.push(identity)
        }
      },
    )
    Tests.expect(result).toBe('done')
    Tests.expect(acquired).toEqual([
      `project:${first}:session:editor-session`,
      `project:${second}:session:editor-session`,
    ])
    Tests.expect(released).toEqual([...acquired].reverse())
  }, { finally: () => cleanProjects(first, second) })
})

Tests.test('sidecar test runner invokes only Bun test in the selected module and reports failures', async () => {
  const calls: string[] = []
  const executor: Workspace.BunExecutor = async (command, args, cwd) => {
    calls.push(`${command}:${args.join(' ')}:${cwd}`)
    return { status: 0, stdout: '', stderr: '' }
  }
  await WorkspaceTests.runSidecarTests('/module', executor)
  Tests.expect(calls).toEqual(['bun:test:/module'])
  await Tests.rejects(
    WorkspaceTests.runSidecarTests('/module', async () => ({ status: 1, stdout: 'test output', stderr: '' })),
    SidecarFailureOutputRegx,
  )
})

function tempProject(name: string): string {
  return Artifacts.resolvePath('tmp', `project-command-${name}-${Platform.randomUUID()}`)
}

async function cleanProjects(...roots: string[]): Promise<void> {
  for (const root of roots) {
    await FS.rm(root, { recursive: true, force: true })
  }
}
