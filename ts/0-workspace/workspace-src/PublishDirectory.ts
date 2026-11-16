import { Errors, Try } from '@shared'
import { FS, Path } from '@shared/os'

/** publishDirectory replaces generated files with a completed directory, restoring the old output on failure. */
export async function publishDirectory(next: string, output: string): Promise<void> {
  await FS.mkdir(Path.dirname(output))
  const previous = `${next}.previous`
  const exists = await Try.WithDefault(false, async () => Boolean(await FS.lstat(output)))
  if (exists) {
    await FS.rename(output, previous)
  }
  await Try(() => FS.rename(next, output), {
    async catch(error) {
      if (exists) {
        await FS.rename(previous, output)
      }
      Errors.Throw(error)
    },
  })
  if (exists) {
    await FS.rm(previous, { recursive: true, force: true })
  }
}
