import * as Embedded from '@fix/embedded'
import { Timings } from '@shared'
import { FormatterResources } from '@shared/os'

/** embeddedFormatting initializes the native source formatter once, only when source tools need it. */
export const embeddedFormatting = Timings.createTopLevelTimer(function(timings): Promise<Embedded.EmbeddedFormatter> {
  formatter ??= FormatterResources.typeScriptFormatterBytes().then(bytes =>
    timings.run(Embedded.createTypeScriptFormatter, bytes)
  )
  return formatter
})

type OptionalFormatter = Promise<Embedded.EmbeddedFormatter> | undefined
let formatter: OptionalFormatter
