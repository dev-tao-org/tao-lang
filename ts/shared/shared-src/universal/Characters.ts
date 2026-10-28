/** NullCharacter separates NUL-delimited records and identifies forbidden NUL bytes. */
export const NullCharacter = '\0'

/** ControlCCharacter identifies the terminal interrupt character. */
export const ControlCCharacter = '\u0003'

/** LineFeedCharacter identifies an LF source line break. */
export const LineFeedCharacter = '\n'

/** LineFeedCharacterCode identifies an LF in UTF-16 source scans. */
export const LineFeedCharacterCode = LineFeedCharacter.charCodeAt(0)
