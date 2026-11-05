/** DefaultAppearance supplies temporary app defaults until Tao styles are implemented.
 *  TODO: Implement authored Tao appearance/style defaults for app backgrounds, text foregrounds,
 *  input placeholders and preview-frame presentation, preserving native component boundaries.
 *  Then migrate these consumers to that styling system and remove DefaultAppearance and this module. */
export const DefaultAppearance = {
  background: '#252525',
  foreground: '#e8e6e3',
  border: '#b8b4ae',
} as const
