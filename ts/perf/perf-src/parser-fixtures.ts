import * as Tests from '@shared-tests'

/** parserFixtures reads the canonical app and derives the ordered full-parse measurement edits. */
export async function parserFixtures(): Promise<ParserFixture[]> {
  const initial = await Tests.readFixture('ts/perf/perf-fixtures/Performance/Performance.tao')
  const editedText = initial.replace('Hello World', 'Hello Tao')
  const addedText = editedText.replace('Text("Hello Tao")', 'Text("Hello Tao") Text("Another view")')
  return [
    { scenario: 'initial', source: initial },
    { scenario: 'text', source: editedText },
    { scenario: 'add-text', source: addedText },
    { scenario: 'row', source: addedText.replace('render Col', 'render Row') },
    { scenario: 'reset', source: initial },
  ]
}

/** ParserFixture records the scenario and complete Tao source measured by parser performance. */
export type ParserFixture = { scenario: string; source: string }
