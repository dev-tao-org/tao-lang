import { FileSystem, Path, Repo } from '@shared/os'
import { prepareProject } from '@workspace/ProjectPreparation'

/** writePreparedTaoApp links existing pinned runtime dependencies for one authored app CLI fixture. */
export async function writePreparedTaoApp(root: string): Promise<string> {
  const entry = Path.join(root, 'Main.tao')
  await FileSystem.writeFile(
    entry,
    'app Demo { root Stage }\nview Stage { render inject ```ts\nreturn <Tao.Text>Ready</Tao.Text>\n``` }',
  )
  await prepareProject(entry, {
    runtimeInstaller: {
      async install(directory) {
        await FileSystem.symlink(
          Repo.resolvePath('ts/7-runtime/node_modules'),
          Path.join(directory, 'node_modules'),
          'dir',
        )
      },
    },
  })
  return entry
}
