import type * as Compile from '@compile'
import type * as Runtime from '@runtime'
import type * as Typecheck from '@typecheck'

import type { ModuleLoadOptions } from '../modules/Loader'
import type { Project } from '../Project'
import type { WorkspacePreparation } from '../ProjectPipeline'
import type { CompiledApp, UpdateResult } from '../Workspace'

/** WorkspaceOptions configures output publication for a single compile session. */
export type WorkspaceOptions = {
  directory?: string
  outputDirectory?: string
  project?: Project
  runtimeOptions?: Omit<Runtime.RuntimeCreateOptions, 'directory'>
  compile?: typeof Compile.compile
  onProgress?: (message: string) => void
  publish?: (app: CompiledApp, isCurrent: () => boolean) => Promise<void>
  onExpected?: (revision: string, startedAtMs: number) => void
  onSourceUpdate?: (result: UpdateResult) => void
  onSourceError?: (error: unknown) => void
  resolveProject?: ModuleLoadOptions['resolveProject']
  observeProjectSources?: ModuleLoadOptions['observeProjectSources']
  includeModuleRequirements?: boolean
  beforeLoad?: ModuleLoadOptions['beforeLoad']
  watchDirectories?: readonly string[]
  beforeCompile?: PrepareWorkspace
}

type WatchAttemptedFiles = (files: readonly string[]) => Promise<void>
type PrepareWorkspace = (
  program: Typecheck.LinkedProgram,
  watchAttemptedFiles: WatchAttemptedFiles,
) => Promise<WorkspacePreparation>
