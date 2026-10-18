import { Tests } from '@shared/os'
import { runtimeLock } from '../cli-checks/runtime-lock'

Tests.test('runtime packaging replaces workspace roots while preserving locked registry resolutions', () => {
  const source = JSON.stringify({
    lockfileVersion: 3,
    configVersion: 1,
    workspaces: { '': { name: 'workspace' }, '7-runtime': { name: '@tao/runtime' } },
    overrides: { unrelated: { dependency: '1.0.0' } },
    packages: {
      '@tao/runtime': ['@tao/runtime@workspace:7-runtime'],
      expo: ['expo@57.0.30', '', { dependencies: { react: '19.2.3' } }, 'expo-integrity'],
      react: ['react@19.2.3', '', {}, 'react-integrity'],
    },
  })
  const packaged = JSON.parse(runtimeLock(source, {
    name: 'tao-expo-toolchain',
    private: true,
    dependencies: { expo: '57.0.30', react: '19.2.3' },
  }))
  Tests.expect(packaged.workspaces).toEqual({
    '': { name: 'tao-expo-toolchain', dependencies: { expo: '57.0.30', react: '19.2.3' } },
  })
  Tests.expect(packaged.packages).toEqual({
    expo: ['expo@57.0.30', '', { dependencies: { react: '19.2.3' } }, 'expo-integrity'],
    react: ['react@19.2.3', '', {}, 'react-integrity'],
  })
  Tests.expect(packaged.overrides).toBeUndefined()
})
