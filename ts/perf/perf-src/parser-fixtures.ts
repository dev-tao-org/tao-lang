import { Tests } from '@shared/os'

/** parserFixtures reads the canonical app and derives the ordered full-parse measurement edits. */
export async function parserFixtures(): Promise<{ scenario: string; source: string }[]> {
  const initial = await Tests.readApp('Hello World')
  const editedText = initial.replace('Hello World', 'Hello Tao')
  const addedText = editedText.replace('Text("Hello Tao")', 'Text("Hello Tao") Text("Another view")')
  return [
    { scenario: 'initial', source: initial },
    { scenario: 'text', source: editedText },
    { scenario: 'add-text', source: addedText },
    { scenario: 'row', source: addedText.replace('render Col', 'render Row') },
  ]
}
