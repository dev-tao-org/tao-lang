import * as Tests from '@shared-tests'

import dependencyAdd from '../CLIs-src/dev-cli/commands/dependency-add'

Tests.test('dependency addition requires an exact registry pin and an existing workspace package', async () => {
  await Tests.expect(dependencyAdd.action('CLIs', 'dependency-cruiser@latest', {})).rejects.toThrow('exact version')
  await Tests.expect(dependencyAdd.action('patches', 'dependency-cruiser@18.7.2', {})).rejects.toThrow(
    'declared workspace package directory',
  )
})
