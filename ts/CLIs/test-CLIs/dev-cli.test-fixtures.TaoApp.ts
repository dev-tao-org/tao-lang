import { S } from '@shared'
import { FS, Path, Repo } from '@shared/os'
import * as Workspace from '@workspace'

/** writePreparedTaoApp links existing pinned runtime dependencies for one authored app CLI fixture. */
export async function writePreparedTaoApp(root: string): Promise<string> {
  const entry = Path.join(root, 'Main.tao')
  await FS.writeFile(
    entry,
    S`
      app Demo { root Stage }
      view Stage { render inject \`\`\`ts
      return <Tao.Text>Ready</Tao.Text>
      \`\`\` }
    `,
  )
  await Workspace.prepareProject(entry, {
    runtimeInstaller: {
      async install(directory) {
        await FS.symlink(
          Repo.resolvePath('ts/7-runtime/node_modules'),
          Path.join(directory, 'node_modules'),
          'dir',
        )
      },
    },
  })
  return entry
}
