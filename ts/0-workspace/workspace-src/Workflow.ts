import { Errors, Switch, Try } from '@shared'
import { Platform } from '@shared/os'
import { inspectProjectPreparation, type PreparationOptions, prepareProject } from './ProjectPreparation'
import { discoverProject } from './projects/Projects'
import { openProjectWorkspace } from './ProjectWorkspace'
import { isSetupRequired, requireSetup } from './SetupRequired'
import type { BunExecutor } from './sidecars/ManagedModules'
import { runAppTests, type TestBrowser } from './testing/AppTests'
import type { TestProgress, TestResult } from './testing/RunTests'
import { runSidecarTests } from './testing/SidecarTests'
import type { UpdateResult } from './Workspace'

/** WorkflowUI supplies consent and cancellation for exactly one caller's workflow. */
export type WorkflowUI = {
  confirm(requirement: { entry: string; message: string }): Promise<boolean>
  cancelled?: () => boolean
}

/** WorkflowRequest names existing workflows and their owning execution inputs. */
export type WorkflowRequest =
  | { kind: 'setup'; entry: string; preparation?: PreparationOptions; for?: 'app-tests' }
  | { kind: 'compile'; entry: string; options?: Parameters<typeof openProjectWorkspace>[1] }
  | {
    kind: 'preview'
    entry: string
    options?: Parameters<typeof openProjectWorkspace>[1]
    restart?: { reason: string; suspend(): Promise<void> }
  }
  | {
    kind: 'app-tests'
    entry: string
    openBrowser: () => Promise<TestBrowser>
    onProgress?: TestProgress
    signal?: AbortSignal
  }
  | { kind: 'sidecar-tests'; entry: string; moduleRoot: string; executor: BunExecutor }

/** WorkflowWorkspace retains the initialized workspace and the original workflow's first compilation receipt. */
export type WorkflowWorkspace = Awaited<ReturnType<typeof openProjectWorkspace>> & { initialResult: UpdateResult }

/** WorkflowServices isolates readiness and mutation at their owning project boundary. */
export type WorkflowServices = {
  inspect: typeof inspectProjectPreparation
  setup: typeof prepareProject
  openWorkspace?: typeof openProjectWorkspace
}

/** execute performs consented setup and dispatches the original workflow automatically.
 *  Preview restarts use a fresh output session so failed replacement builds retain last-good bundles and snapshots.
 *  Inactive generations are retained until the existing project cache cleanup removes them. */
export function execute(
  request: Extract<WorkflowRequest, { kind: 'compile' | 'preview' }>,
  ui: WorkflowUI,
  services?: WorkflowServices,
): Promise<WorkflowWorkspace>
export function execute(
  request: Extract<WorkflowRequest, { kind: 'app-tests' }>,
  ui: WorkflowUI,
  services?: WorkflowServices,
): Promise<TestResult[]>
export function execute(
  request: Extract<WorkflowRequest, { kind: 'setup' | 'sidecar-tests' }>,
  ui: WorkflowUI,
  services?: WorkflowServices,
): Promise<void>
export async function execute(
  request: WorkflowRequest,
  ui: WorkflowUI,
  services: WorkflowServices = { inspect: inspectProjectPreparation, setup: prepareProject },
): Promise<WorkflowWorkspace | TestResult[] | void> {
  await prepareWorkflow(request, ui, services)
  assertActive(ui)
  return await Try(() => dispatch(request, services), {
    async catch(error) {
      if (!isSetupRequired(error)) {
        return Errors.Throw(error)
      }
      await confirmSetup(request.entry, error.message, ui)
      await services.setup(request.entry)
      assertActive(ui)
      return await dispatch(request, services)
    },
  })
}

function dispatch(
  request: WorkflowRequest,
  services: WorkflowServices,
): Promise<WorkflowWorkspace | TestResult[] | void> {
  return Switch.kind<WorkflowRequest, Promise<WorkflowWorkspace | TestResult[] | void>>(request, {
    async setup() {},
    compile: value => openWorkflowWorkspace(value, services),
    preview: value => openWorkflowWorkspace(value, services),
    'app-tests': value => runAppTests(value.entry, value.openBrowser, value.onProgress, value.signal),
    'sidecar-tests': value => runSidecarTests(value.moduleRoot, value.executor),
  })
}

async function prepareWorkflow(request: WorkflowRequest, ui: WorkflowUI, services: WorkflowServices): Promise<void> {
  assertActive(ui)
  const restart = request.kind === 'preview' ? request.restart : undefined
  if (restart) {
    await confirmSetup(request.entry, restart.reason, ui)
    await restart.suspend()
  }
  if (request.kind === 'setup' && request.preparation?.repair) {
    await confirmSetup(request.entry, 'Repair the generated dependency files.', ui)
    await services.setup(request.entry, request.preparation)
    return
  }
  await Try(async () => {
    if (request.kind !== 'app-tests' || await discoverProject(request.entry)) {
      await services.inspect(
        request.entry,
        inspectionOptions(request),
      )
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
      await services.setup(request.entry, request.kind === 'setup' ? request.preparation : undefined)
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
  request: Extract<WorkflowRequest, { kind: 'compile' | 'preview' }>,
  services: WorkflowServices,
): Promise<WorkflowWorkspace> {
  const options = createWorkflowWorkspaceOptions(request)
  const workspace = await (services.openWorkspace ?? openProjectWorkspace)(request.entry, options)
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

function createWorkflowWorkspaceOptions(request: Extract<WorkflowRequest, { kind: 'compile' | 'preview' }>) {
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
