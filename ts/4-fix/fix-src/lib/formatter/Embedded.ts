import { CarriageReturnCharacter, NewlineCharacter, Timings, Try } from '@shared'
import { createFromBuffer } from './Bridge_dprint-formatter/Bridge_dprint-formatter'

/** EmbeddedFormatter formats a native function body or preserves it by returning undefined. */
export type EmbeddedFormatter = (source: string, options: EmbeddedOptions) => string | undefined

/** createTypeScriptFormatter initializes one reusable TSX formatter from externally loaded WASM. */
export const createTypeScriptFormatter = Timings.createTopLevelTimer(function(timings, bytes: Uint8Array) {
  return timings.run(initialize, bytes)
})

type EmbeddedOptions = { indent: number; level: number; width: number; newline: string }

const initialize = Timings.measured('formatter.typescript.initialize', function(bytes: Uint8Array) {
  const formatter = createFromBuffer(Uint8Array.from(bytes))
  formatter.setConfig({}, { 'semiColons': 'asi', 'quoteStyle': 'preferSingle', 'jsx.quoteStyle': 'preferDouble' })
  const format: EmbeddedFormatter = (source, options) =>
    Try.WithDefault(undefined, () =>
      formatter.formatText({
        filePath: 'injection.tsx',
        fileText: source,
        overrideConfig: {
          indentWidth: options.indent,
          lineWidth: options.width,
          fileIndentLevel: options.level,
          newLineKind: options.newline === (CarriageReturnCharacter + NewlineCharacter) ? 'crlf' : 'lf',
        },
      }))
  return Object.assign(format, { license: formatter.getLicenseText() })
})
