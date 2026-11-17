import { FS, Repo } from '@shared/os'

/** PerformanceFixturePath names the shared authored workload relative to the repository root. */
export const PerformanceFixturePath = 'ts/repo-analysis/performance-fixtures/Performance/Performance.tao'

/** readPerformanceFixture reads the authored source shared by performance workloads. */
export function readPerformanceFixture(): Promise<string> {
  return FS.file(Repo.resolvePath(PerformanceFixturePath)).text()
}

/** parserFixtures reads the canonical app and derives the ordered full-parse measurement edits. */
export async function parserFixtures(): Promise<ParserFixture[]> {
  const initial = await readPerformanceFixture()
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
