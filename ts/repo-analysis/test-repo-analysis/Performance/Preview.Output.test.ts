import * as Tests from '@shared-tests'

import { describePreviewOutput } from '../../repo-analysis-src/Performance/Preview/PreviewOutput'

Tests.test('preview output matches revisions despite duplicate or unmatched watcher publications', () => {
  const timing = { saveToHmrMs: 10, saveToAppliedMs: 20, pipeline: [] }
  const lines = describePreviewOutput({
    results: [{ scenario: 'text', revision: 'text-revision' }, { scenario: 'reset', revision: 'reset-revision' }],
    reloads: [
      { ...timing, revision: 'unmatched' },
      { ...timing, revision: 'reset-revision' },
      { ...timing, revision: 'text-revision' },
      { ...timing, revision: 'text-revision' },
    ],
  })
  Tests.expect(lines.map(line => line.scenario)).toEqual(['text', 'reset'])
  Tests.expect(lines.map(line => line.timing?.revision)).toEqual(['text-revision', 'reset-revision'])
})
