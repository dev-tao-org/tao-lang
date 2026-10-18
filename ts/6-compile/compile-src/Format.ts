import { Timings } from '@shared'
import { CodeFormatting } from '@shared/os'

/** Formatter formats complete generated modules without reading or writing their output paths. */
export type Formatter = {
  format(file: FormatFile, timings?: Timings): string
}

/** createFormatter initializes one reusable backend before synchronous formatting calls. */
export async function createFormatter(timings = new Timings('formatter')): Promise<Formatter> {
  const backend = await Initialize(timings)
  return {
    format: (file, timings = new Timings('formatter')) => Format(timings, backend, file),
  }
}

type FormatFile = { path: string; text: string }

const Initialize = Timings.measure('formatter.initialize', CodeFormatting.create)
const Format = Timings.measure('formatter.format', formatFile)

function formatFile(backend: CodeFormatting.Backend, file: FormatFile): string {
  return backend(file.path, file.text)
}
