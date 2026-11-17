import { Artifacts, Path, Platform } from '@shared/os'
import { initializeProject } from './projects/Projects'

/** ProjectOptions selects a project folder and whether artifact cleanup owns its lifetime. */
export type ProjectOptions = { directory?: string; persistent?: boolean }
/** createProject creates a Tao project folder; runtime setup belongs to workspace compilation. */
export async function createProject(options: ProjectOptions = {}): Promise<Project> {
  const directory = Path.resolve(options.directory ?? Artifacts.resolvePath('performance', Platform.randomUUID()))
  if (!options.persistent) {
    Artifacts.trackTemporary(directory)
  }
  const project = await initializeProject(directory)
  const session = `workspace-${Platform.randomUUID()}`
  return { directory: project.root, buildDirectory: Path.join(project.sessionsDirectory, session, 'build') }
}

/** Project identifies an authored Tao project and its separate compilation output directory. */
export type Project = { directory: string; buildDirectory: string }
