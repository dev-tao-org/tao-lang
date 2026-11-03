import { Errors } from '@shared'
import * as Tests from '@shared-tests'

import { openProjectWorkspace } from '../../workspace-src/ProjectWorkspace'
import type { ProjectWorkspaceOptions } from '../../workspace-src/ProjectWorkspace'
import { requireSetup } from '../../workspace-src/SetupRequired'
import { execute, type WorkflowServices, type WorkflowUI } from '../../workspace-src/Workflow'
import type { WorkspaceSession } from '../../workspace-src/Workspace'

const SetupDeclinedErrorRegx = /declined/
const SetupCancelledErrorRegx = /cancelled/
const DurableLockRestoreRequiredRegx = /Restore the durable lock/
const PreviewRestartIdentifierRegx = /^preview-restart-/

Tests.test('a missing setup is consented once and the original workflow resumes automatically', async () => {
  const events: string[] = []
  const services = recordingServices(events)
  await execute({ kind: 'setup', entry: '/entry.tao' }, recordingUI(events), services)
  Tests.expect(events).toEqual(['inspect', 'prompt', 'setup'])
})

Tests.test('ready setup does not prompt or install, and declined setup never mutates', async () => {
  const events: string[] = []
  await execute({ kind: 'setup', entry: '/entry.tao' }, recordingUI(events), {
    ...recordingServices(events),
    async inspect() {
      events.push('ready')
    },
  })
  Tests.expect(events).toEqual(['ready'])
  events.length = 0
  await Tests.rejects(
    execute({ kind: 'setup', entry: '/entry.tao' }, recordingUI(events, false), recordingServices(events)),
    SetupDeclinedErrorRegx,
  )
  Tests.expect(events).toEqual(['inspect', 'prompt'])
})

Tests.test('cancellation after consent and uncertain repairs never run setup', async () => {
  const events: string[] = []
  let cancelled = false
  const ui = recordingUI(events)
  ui.cancelled = () => cancelled
  ui.confirm = async () => {
    cancelled = true
    return true
  }
  await Tests.rejects(
    execute({ kind: 'setup', entry: '/entry.tao' }, ui, recordingServices(events)),
    SetupCancelledErrorRegx,
  )
  Tests.expect(events).toEqual(['inspect'])
  await Tests.rejects(
    execute({ kind: 'setup', entry: '/entry.tao' }, recordingUI(events), {
      ...recordingServices(events),
      inspect: async () => Errors.ThrowUserInput('Restore the durable lock.'),
    }),
    DurableLockRestoreRequiredRegx,
  )
  Tests.expect(events).toEqual(['inspect'])
})

Tests.test('compile performs setup and finishes the original request without a manual retry', async () => {
  const events: string[] = []
  const workspace = await execute({ kind: 'compile', entry: '/entry.tao' }, recordingUI(events), {
    ...recordingServices(events),
    openWorkspace: recordingWorkspace(events),
  })
  Tests.expect(workspace.initialResult.status).toBe('published')
  Tests.expect(events).toEqual(['inspect', 'prompt', 'setup', 'open', 'compile'])
})

Tests.test('preview recovery retains the old session until consent then releases it before setup and restarts', async () => {
  const events: string[] = []
  const request = {
    kind: 'preview' as const,
    entry: '/entry.tao',
    restart: {
      reason: 'Dependency changed.',
      async suspend() {
        events.push('release')
      },
    },
  }
  const services = {
    ...recordingServices(events),
    openWorkspace(entry: string, options?: ProjectWorkspaceOptions) {
      Tests.expect(options?.id).toMatch(PreviewRestartIdentifierRegx)
      return recordingWorkspace(events)(entry, options)
    },
  }
  await Tests.rejects(execute(request, recordingUI(events, false), services), SetupDeclinedErrorRegx)
  Tests.expect(events).toEqual(['prompt'])
  events.length = 0
  await execute(request, recordingUI(events), services)
  Tests.expect(events).toEqual(['prompt', 'release', 'inspect', 'setup', 'open', 'watch'])
})

Tests.test('a newly unmet requirement during startup releases the failed workspace and retries automatically once', async () => {
  const events: string[] = []
  let attempts = 0
  const missing = recordingWorkspace(events, true)
  const ready = recordingWorkspace(events)
  await execute({ kind: 'compile', entry: '/entry.tao' }, recordingUI(events), {
    ...recordingServices(events),
    async inspect() {
      events.push('ready')
    },
    openWorkspace: (...args) => attempts++ === 0 ? missing(...args) : ready(...args),
  })
  Tests.expect(events).toEqual(['ready', 'open', 'compile', 'dispose', 'prompt', 'setup', 'open', 'compile'])
})

Tests.test('sidecar tests run once after required setup', async () => {
  const events: string[] = []
  await execute(
    {
      kind: 'sidecar-tests',
      entry: '/entry.tao',
      moduleRoot: '/module',
      async executor(command, args, cwd) {
        events.push([command, ...args, cwd].join(' '))
        return { status: 0, stdout: '', stderr: '' }
      },
    },
    recordingUI(events),
    recordingServices(events),
  )
  Tests.expect(events).toEqual(['inspect', 'prompt', 'setup', 'bun test /module'])
})

function recordingWorkspace(events: string[], needsSetup = false): typeof openProjectWorkspace {
  const result = {
    status: needsSetup ? 'failed' : 'published',
    revision: 'first',
    timings: [],
    stages: {},
    error: 'A new requirement needs setup.',
    setupRequired: needsSetup,
  }
  return async () => {
    events.push('open')
    return {
      files: {
        async compileFile() {
          events.push('compile')
          return result
        },
      },
      async openFile() {
        events.push('watch')
        return result
      },
      async dispose() {
        events.push('dispose')
      },
    } as unknown as WorkspaceSession
  }
}

function recordingServices(events: string[]): WorkflowServices {
  return {
    async inspect() {
      events.push('inspect')
      requireSetup('Runtime needs setup.')
    },
    async setup() {
      events.push('setup')
    },
  }
}

function recordingUI(events: string[], accepted = true): WorkflowUI {
  return {
    async confirm() {
      events.push('prompt')
      return accepted
    },
  }
}
