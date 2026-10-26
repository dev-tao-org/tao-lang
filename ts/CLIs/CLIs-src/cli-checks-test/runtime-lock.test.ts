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
      '@types/react': ['@types/react@19.2.0', '', {}, 'types-react-integrity'],
      '@types/react-dom': ['@types/react-dom@19.2.0', '', {}, 'types-react-dom-integrity'],
    },
  })
  const packaged = JSON.parse(runtimeLock(source, {
    name: 'tao-expo-toolchain',
    private: true,
    dependencies: { expo: '57.0.30', react: '19.2.3' },
    devDependencies: { '@types/react': '~19.2.0', '@types/react-dom': '~19.2.0' },
  }))
  Tests.expect(packaged.workspaces).toEqual({
    '': {
      name: 'tao-expo-toolchain',
      dependencies: { expo: '57.0.30', react: '19.2.3' },
      devDependencies: { '@types/react': '~19.2.0', '@types/react-dom': '~19.2.0' },
    },
  })
  Tests.expect(packaged.packages).toEqual({
    expo: ['expo@57.0.30', '', { dependencies: { react: '19.2.3' } }, 'expo-integrity'],
    react: ['react@19.2.3', '', {}, 'react-integrity'],
    '@types/react': ['@types/react@19.2.0', '', {}, 'types-react-integrity'],
    '@types/react-dom': ['@types/react-dom@19.2.0', '', {}, 'types-react-dom-integrity'],
  })
  Tests.expect(packaged.overrides).toBeUndefined()
})

Tests.test('runtime packaging keeps registry resolutions and their patched dependency hashes', () => {
  const source = JSON.stringify({
    lockfileVersion: 3,
    configVersion: 1,
    workspaces: { '': { name: 'workspace' } },
    packages: {
      'metro-fixture': ['metro-fixture@1.0.0', '', { dependencies: { 'metro-helper': '^2.0.0' } }, 'metro-integrity'],
      'metro-helper': ['metro-helper@2.0.0', '', {}, 'helper-integrity'],
    },
    patchedDependencies: {
      'metro-fixture@1.0.0': 'fixture-patch-hash',
      'metro-helper@2.0.0': 'helper-patch-hash',
    },
  })

  const packaged = JSON.parse(runtimeLock(source, {
    name: 'tao-expo-toolchain',
    private: true,
    dependencies: { 'metro-fixture': '1.0.0' },
    patchedDependencies: {
      'metro-fixture@1.0.0': 'patches/metro-fixture.patch',
      'metro-helper@2.0.0': 'patches/metro-helper.patch',
    },
  }))

  Tests.expect(packaged.packages).toEqual({
    'metro-fixture': ['metro-fixture@1.0.0', '', { dependencies: { 'metro-helper': '^2.0.0' } }, 'metro-integrity'],
    'metro-helper': ['metro-helper@2.0.0', '', {}, 'helper-integrity'],
  })
  Tests.expect(packaged.patchedDependencies).toEqual({
    'metro-fixture@1.0.0': 'fixture-patch-hash',
    'metro-helper@2.0.0': 'helper-patch-hash',
  })
})
