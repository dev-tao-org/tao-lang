import { createTypeScriptFormatter, type EmbeddedFormatter } from '@fix/lib/formatter/Embedded'
import { Timings } from '@shared'
import { FormatterResources } from '@shared/os'

/** embeddedFormatting initializes the native source formatter once, only when source tools need it. */
export const embeddedFormatting = Timings.createTopLevelTimer(function(timings): Promise<EmbeddedFormatter> {
  formatter ??= FormatterResources.typeScriptFormatterBytes().then(bytes =>
    timings.run(createTypeScriptFormatter, bytes)
  )
  return formatter
})

type OptionalFormatter = Promise<EmbeddedFormatter> | undefined
let formatter: OptionalFormatter
