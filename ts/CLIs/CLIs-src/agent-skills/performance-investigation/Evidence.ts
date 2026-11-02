import { Errors, Try } from '@shared'
import { FileSystem, Path } from '@shared/os'

/** EvidenceSource names a directory containing command logs or raw preview reports. */
export type EvidenceSource = { directory: string; label: string }

/** runWithEvidence retains new raw reports and logs for execution and postvalidation failures alike. */
export async function runWithEvidence<Value>(
  directory: string,
  sources: EvidenceSource[],
  run: () => Promise<Value>,
): Promise<Value> {
  const before = await Promise.all(sources.map(source => listFiles(source.directory)))
  return await Try(run, {
    async catch(error) {
      for (const [index, source] of sources.entries()) {
        const created = (await listFiles(source.directory)).filter(name => !before[index].includes(name))
        for (const name of created) {
          const target = Path.join(directory, `failed-${source.label}-${name}`)
          await FileSystem.copyFile(Path.join(source.directory, name), target)
        }
      }
      Errors.Throw(error)
    },
  })
}

async function listFiles(directory: string): Promise<string[]> {
  if (!await FileSystem.exists(directory)) {
    return []
  }
  const entries = await FileSystem.readdir(directory, { withFileTypes: true })
  return entries.filter(entry => entry.isFile()).map(entry => entry.name)
}
