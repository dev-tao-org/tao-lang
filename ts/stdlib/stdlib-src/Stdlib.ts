import { FileSystem, Path } from '@shared/os'
import UI from './@tao/ui/Views.tao' with { type: 'text' }

/** directory identifies authored standard sources when running from a source checkout. */
export const directory = sourceDirectory()

/** sources embeds standard sources so installed CLI builds do not depend on this repository. */
export const sources: ReadonlyMap<string, string> = new Map([
  [Path.resolve(directory ?? '/__tao_stdlib__', '@tao/ui/Views.tao'), UI],
])

function sourceDirectory(): string | undefined {
  const candidate = Path.dirname(Path.fileURLToPath(import.meta.url))
  return FileSystem.existsSync(Path.join(candidate, '@tao/ui/Views.tao')) ? candidate : undefined
}
