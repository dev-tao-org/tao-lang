export {
  DocClosingLine,
  DocDescription,
  DocLinePrefix,
  DocOpeningLine,
  EmittedModuleSyntaxRegx,
  ExternalSourcePath,
  ExternalSourceProvenance,
  GeneratedSourceSuffix,
  IdentifierCharacter,
  LineBreak,
  NewlineCharacter,
  NonWhitespaceStart,
  OptionalCarriageNewline,
  RelativePathPrefix,
}

/** DocLinePrefix matches the decorative prefix of a JSDoc line. */
const DocLinePrefix = /^\s*\* ?/gm
/** DocDescription matches a name followed by description text. */
const DocDescription = /^\S+\s+\S+/
/** IdentifierCharacter matches a character which continues a JavaScript identifier. */
const IdentifierCharacter = /[\w$]/
/** LineBreak matches portable newline sequences. */
const LineBreak = /\r\n|\r|\n/
/** DocOpeningLine matches the required JSDoc opening name and description. */
const DocOpeningLine = /^\/\*\* \S+ \S/
/** DocClosingLine matches a JSDoc terminator after text. */
const DocClosingLine = /\S \*\/$/
/** NonWhitespaceStart matches a line starting with content. */
const NonWhitespaceStart = /^\S/
/** NewlineCharacter matches the line terminators recognized by the TypeScript scanner. */
const NewlineCharacter = /[\r\n\u2028\u2029]/
/** OptionalCarriageNewline matches newline sequences with optional carriage returns. */
const OptionalCarriageNewline = /\r?\n/
/** RelativePathPrefix matches an explicit relative-path prefix. */
const RelativePathPrefix = /^\.\//
/** ExternalSourcePath matches source directory boundaries excluded from handwritten checks. */
const ExternalSourcePath = /(?:^|\/)(?:node_modules|_gen_[^/]*|generated|vendor|third-party)(?:\/|$)/u
/** GeneratedSourceSuffix matches explicitly generated TypeScript filenames. */
const GeneratedSourceSuffix = /\.generated\.(?:ts|tsx|mts|cts)$/u
/** ExternalSourceProvenance matches generated or third-party provenance markers. */
const ExternalSourceProvenance = /@(?:generated|third-party)\b/u

/** EmittedModuleSyntaxRegx matches module-loading syntax in emitted source templates. */
const EmittedModuleSyntaxRegx = /\b(?:import|export|require|createRequire)\b/u
