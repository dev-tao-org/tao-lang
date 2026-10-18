import * as FileSystem from './FileSystem'

/** Backend formats source in memory using the virtual output path to select syntax. */
export type Backend = (path: string, text: string) => string

/** create initializes the TypeScript formatter once for a caller-owned formatting session. */
export async function create(): Promise<Backend> {
  const [{ createContext }, typescript] = await Promise.all([
    import('@dprint/formatter'),
    import('@dprint/typescript'),
  ])
  const context = createContext({ indentWidth: 2, useTabs: false, lineWidth: 120 })
  const formatter = context.addPlugin(await FileSystem.readFile(typescript.getPath()), {
    semiColons: 'asi',
    quoteStyle: 'preferSingle',
  })
  return (filePath, fileText) => formatter.formatText({ filePath, fileText })
}
