/** NullCharacter separates NUL-delimited records and identifies forbidden NUL bytes. */
export const NullCharacter = '\0'

/** ControlCCharacter identifies the terminal interrupt character. */
export const ControlCCharacter = '\u0003'

/** ControlDCharacter marks terminal input closure. */
export const ControlDCharacter = '\u0004'

/** BackspaceCharacter identifies the backspace control character. */
export const BackspaceCharacter = '\b'

/** TabCharacter separates tab-delimited fields. */
export const TabCharacter = '\t'

/** NewlineCharacter separates lines in serialized text. */
export const NewlineCharacter = '\n'

/** CarriageReturnCharacter identifies the carriage-return control character. */
export const CarriageReturnCharacter = '\r'

/** EscapeCharacter prefixes terminal control sequences. */
export const EscapeCharacter = '\u001b'

/** RecordSeparatorCharacter separates framed process records. */
export const RecordSeparatorCharacter = '\u001e'

/** DeleteCharacter identifies the delete control character. */
export const DeleteCharacter = '\u007f'
/** NewlineCharacterCode identifies an LF in UTF-16 source scans. */
export const NewlineCharacterCode = NewlineCharacter.charCodeAt(0)
