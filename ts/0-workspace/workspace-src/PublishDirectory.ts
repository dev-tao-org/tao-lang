import { Errors, Try } from '@shared'
import { FS, Path } from '@shared/os'

/** publishDirectory installs completed output, restoring the old output if installation fails. */
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
    // Installation is already committed. Session cleanup can remove a displaced tree later.
    await Try.IgnoreError(() => FS.rm(previous, { recursive: true, force: true }))
  }
}
