import { createTypeScriptFormatter, type EmbeddedFormatter } from '@fix/lib/formatter/Embedded'
import { Timings } from '@shared'
import { FormatterResources } from '@shared/os'

/** embeddedFormatting initializes the native source formatter once, only when source tools need it. */
export function embeddedFormatting(timings: Timings): Promise<EmbeddedFormatter> {
  formatter ??= FormatterResources.typeScriptFormatterBytes().then(bytes => createTypeScriptFormatter(bytes, timings))
  return formatter
}

let formatter: Promise<EmbeddedFormatter> | undefined
