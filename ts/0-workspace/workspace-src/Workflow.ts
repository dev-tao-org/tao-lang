import { Errors, Switch, Try } from '@shared'
import { Platform } from '@shared/os'
import { inspectProjectPreparation, type PreparationOptions, prepareProject } from './ProjectPreparation'
import { discoverProject } from './projects/Projects'
import { openProjectWorkspace, type ProjectWorkspaceOptions } from './ProjectWorkspace'
import { isSetupRequired, requireSetup } from './SetupRequired'
import type { BunExecutor } from './sidecars/ManagedModule/ManagedModules'
import { type AppTestTarget, runAppTests } from './testing/AppTests'
import type { TestProgress, TestResult } from './testing/RunTests'
import { runSidecarTests } from './testing/WorkspaceTests'
import type { UpdateResult, WorkspaceSession } from './Workspace'

/** WorkflowUI supplies consent and cancellation for exactly one caller's workflow. */
export type WorkflowUI = {
  confirm(requirement: { entry: string; message: string }): Promise<boolean>
  cancelled?: () => boolean
}

type SetupWorkflowRequest = { kind: 'setup'; entry: string; preparation?: PreparationOptions; for?: 'app-tests' }
type CompileWorkflowRequest = { kind: 'compile'; entry: string; options?: ProjectWorkspaceOptions }
type PreviewRestart = { reason: string; suspend(): Promise<void> }
type PreviewWorkflowRequest = {
  kind: 'preview'
  entry: string
  options?: ProjectWorkspaceOptions
  restart?: PreviewRestart
}
type AppTestsWorkflowRequest = {
  kind: 'app-tests'
  entry: string
  target: AppTestTarget
  onProgress?: TestProgress
  signal?: AbortSignal
}
type SidecarTestsWorkflowRequest = { kind: 'sidecar-tests'; entry: string; moduleRoot: string; executor: BunExecutor }

/** WorkflowRequest names existing workflows and their owning execution inputs. */
export type WorkflowRequest =
  | SetupWorkflowRequest
  | CompileWorkflowRequest
  | PreviewWorkflowRequest
  | AppTestsWorkflowRequest
  | SidecarTestsWorkflowRequest

/** WorkflowWorkspace retains the initialized workspace and the original workflow's first compilation receipt. */
export type WorkflowWorkspace = WorkspaceSession & { initialResult: UpdateResult }

type CompileWorkflowKind = 'compile' | 'preview'
type PreparationWorkflowKind = 'setup' | 'sidecar-tests'
type WorkflowExecutionResult = WorkflowWorkspace | TestResult[] | void

/** execute performs consented setup and dispatches the original workflow automatically.
 *  Preview restarts use a fresh output session so failed replacement builds retain last-good bundles and snapshots.
 *  Inactive generations are retained until the existing project cache cleanup removes them. */
export function execute(
  request: Extract<WorkflowRequest, { kind: CompileWorkflowKind }>,
  ui: WorkflowUI,
): Promise<WorkflowWorkspace>
export function execute(
  request: Extract<WorkflowRequest, { kind: 'app-tests' }>,
  ui: WorkflowUI,
): Promise<TestResult[]>
export function execute(
  request: Extract<WorkflowRequest, { kind: PreparationWorkflowKind }>,
  ui: WorkflowUI,
): Promise<void>
export async function execute(
  request: WorkflowRequest,
  ui: WorkflowUI,
): Promise<WorkflowExecutionResult> {
  await prepareWorkflow(request, ui)
  assertActive(ui)
  return await Try(() => dispatch(request), {
    async catch(error) {
      if (!isSetupRequired(error)) {
        return Errors.Throw(error)
      }
      await confirmSetup(request.entry, error.message, ui)
      await prepareProject(request.entry)
      assertActive(ui)
      return await dispatch(request)
    },
  })
}

function dispatch(request: WorkflowRequest): Promise<WorkflowExecutionResult> {
  return Switch.kind<WorkflowRequest, Promise<WorkflowExecutionResult>>(request, {
    async 'setup'() {},
    'compile': value => openWorkflowWorkspace(value),
    'preview': value => openWorkflowWorkspace(value),
    'app-tests': value => runAppTests(value.entry, value.target, value.onProgress, value.signal),
    'sidecar-tests': value => runSidecarTests(value.moduleRoot, value.executor),
  })
}

export type { AppTestDevice, AppTestTarget } from './testing/AppTests'

async function prepareWorkflow(request: WorkflowRequest, ui: WorkflowUI): Promise<void> {
  assertActive(ui)
  const restart = request.kind === 'preview' ? request.restart : undefined
  if (restart) {
    await confirmSetup(request.entry, restart.reason, ui)
    await restart.suspend()
  }
  if (request.kind === 'setup' && request.preparation?.repair) {
    await confirmSetup(request.entry, 'Repair the generated dependency files.', ui)
    await prepareProject(request.entry, request.preparation)
    return
  }
  await Try(async () => {
    if (request.kind !== 'app-tests' || await discoverProject(request.entry)) {
      await inspectProjectPreparation(request.entry, inspectionOptions(request))
    }
  }, {
    async catch(error) {
      if (!isSetupRequired(error)) {
        return Errors.Throw(error)
      }
      if (!restart) {
        await confirmSetup(request.entry, error.message, ui)
      }
      assertActive(ui)
      await prepareProject(request.entry, request.kind === 'setup' ? request.preparation : undefined)
    },
  })
}

function inspectionOptions(request: WorkflowRequest) {
  if (request.kind === 'sidecar-tests') {
    return { moduleRoot: request.moduleRoot }
  }
  return request.kind === 'app-tests' || (request.kind === 'setup' && request.for === 'app-tests')
    ? { runtime: false }
    : undefined
}

async function openWorkflowWorkspace(
  request: Extract<WorkflowRequest, { kind: CompileWorkflowKind }>,
): Promise<WorkflowWorkspace> {
  const options = createWorkflowWorkspaceOptions(request)
  const workspace = await openProjectWorkspace(request.entry, options)
  return await Try(async () => {
    const initialResult = request.kind === 'preview'
      ? await workspace.openFile(request.entry)
      : await workspace.files.compileFile(request.entry)
    if (initialResult.status !== 'published') {
      if (initialResult.status === 'failed' && initialResult.setupRequired) {
        requireSetup(initialResult.error)
      }
      Errors.ThrowUserInput(
        initialResult.status === 'failed'
          ? initialResult.error
          : `Workflow compilation was ${initialResult.status}: ${request.entry}`,
      )
    }
    return Object.assign(workspace, { initialResult })
  }, {
    async catch(error) {
      await workspace.dispose()
      return Errors.Throw(error)
    },
  })
}

function createWorkflowWorkspaceOptions(request: Extract<WorkflowRequest, { kind: CompileWorkflowKind }>) {
  return request.kind === 'preview' && request.restart
    ? { ...request.options, id: `preview-restart-${Platform.randomUUID()}` }
    : request.options
}

async function confirmSetup(entry: string, message: string, ui: WorkflowUI): Promise<void> {
  if (!await ui.confirm({ entry, message })) {
    Errors.ThrowUserInput('Dependency setup was declined.')
  }
  assertActive(ui)
}

function assertActive(ui: WorkflowUI): void {
  if (ui.cancelled?.()) {
    Errors.ThrowUserInput('Workflow cancelled.')
  }
}
