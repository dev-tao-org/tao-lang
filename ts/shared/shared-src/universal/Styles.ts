type CSSDeclarations = Record<string, string>
type CSSStylesheet = Record<string, CSSDeclarations>

/** declarations serializes authored CSS declarations in insertion order. */
export function declarations(styleDeclarations: CSSDeclarations): string {
  return Object.entries(styleDeclarations).map(([property, value]) => `${property}:${value}`).join(';')
}

/** stylesheet serializes authored selectors and declarations in insertion order. */
export function stylesheet(styleRules: CSSStylesheet): string {
  return Object.entries(styleRules).map(([selector, styleDeclarations]) =>
    `${selector}{${declarations(styleDeclarations)}}`
  ).join('')
}
