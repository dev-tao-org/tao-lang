import type { compile } from '@compile/Compile'
import type { RuntimeCreateOptions } from '@runtime/Runtime'
import type { LinkedProgram } from '@typecheck/Modules'
import type { FileManagerOptions } from './FileManager'
import type { ModuleLoadOptions } from './modules/Loader'
import type { Project } from './Project'
import type { ProjectPipelineResult } from './ProjectPipeline'
import type { CompiledApp, UpdateResult } from './Workspace'

/** WorkspaceOptions configures output publication for a single compile session. */
export type WorkspaceOptions = {
  directory?: string
  outputDirectory?: string
  project?: Project
  runtimeOptions?: Omit<RuntimeCreateOptions, 'directory'>
  compile?: typeof compile
  onProgress?: (message: string) => void
  publish?: (app: CompiledApp, isCurrent: () => boolean) => Promise<void>
  onExpected?: (revision: string, startedAtMs: number) => void
  onSourceUpdate?: (result: UpdateResult) => void
  onSourceError?: (error: unknown) => void
  watch?: FileManagerOptions['watch']
  schedule?: FileManagerOptions['schedule']
  resolveProject?: ModuleLoadOptions['resolveProject']
  observeProjectSources?: ModuleLoadOptions['observeProjectSources']
  includeModuleRequirements?: boolean
  beforeLoad?: () => Promise<void>
  watchDirectories?: readonly string[]
  beforeCompile?: PrepareWorkspace
}

type WatchAttemptedFiles = (files: readonly string[]) => Promise<void>
type WorkspacePreparation = Partial<ProjectPipelineResult>
type PrepareWorkspace = (
  program: LinkedProgram,
  watchAttemptedFiles: WatchAttemptedFiles,
) => Promise<WorkspacePreparation>
