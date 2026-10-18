import { Artifacts, FileSystem, Path, Platform } from '@shared/os'

/** createProject creates a Tao project folder; runtime setup belongs to workspace compilation. */
export async function createProject(options: ProjectOptions = {}): Promise<Project> {
  const directory = Path.resolve(options.directory ?? Artifacts.resolvePath('performance', Platform.randomUUID()))
  if (!options.persistent) {
    Artifacts.trackTemporary(directory)
  }
  await FileSystem.mkdir(Path.join(directory, '.tao'), { recursive: true })
  return { directory, buildDirectory: Path.join(directory, '.tao/cache/build') }
}

/** Project identifies an authored Tao project and its separate compilation output directory. */
export type Project = { directory: string; buildDirectory: string }

/** ProjectOptions selects a project folder and whether artifact cleanup owns its lifetime. */
export type ProjectOptions = { directory?: string; persistent?: boolean }
