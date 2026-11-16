import { Json, S } from '@shared'

type LibraryProjectFile = { path: string; contents: string }

/** libraryProjectFiles defines the small Tao library and React consumer starter. */
export const libraryProjectFiles: readonly LibraryProjectFile[] = [
  {
    path: 'Justfile',
    contents: S`
      TAO := env_var_or_default('TAO', 'tao')

      help:
        @just --list

      compile:
        "{{TAO}}" compile Demo --package src/ts

      run:
        "{{TAO}}" run --package src/ts --web

      check: compile
        cd src/ts && bun run check
    `,
  },
  {
    path: 'README.md',
    contents: S`
      # Tao TypeScript library

      This project publishes a Tao library and runs it in a small React consumer.

      - just compile compiles the Tao library.
      - just run compiles it and starts the managed Expo web consumer.
      - just check compiles the library and typechecks the authored React consumer.

      Install the package's declared dependencies before running the TypeScript check or app. Set TAO to a Tao executable when it is not available as tao on your PATH.
    `,
  },
  {
    path: 'src/tao/Library.tao',
    contents: S`
      use tao@ui Text

      ts-library Demo {
        publish { Greeting, }
      }

      public
      view Greeting(Name text) {
        render Text(Name)
      }
    `,
  },
  { path: 'src/ts/package.json', contents: serializeLibraryProjectManifest() },
  { path: 'src/ts/tsconfig.json', contents: serializeLibraryProjectTypeScript() },
  { path: 'src/ts/.gitignore', contents: 'node_modules/\n' },
  {
    path: 'src/ts/Consumer.tsx',
    contents: S`
      import library from '@tao-dev/ts-lib-example'
      import Greeting from '@tao-dev/ts-lib-example/Greeting'
      import React from 'react'
      import { Text, View } from 'react-native'

      const instance = library.instantiate()

      export default function Consumer() {
        return (
          <View>
            <Text>Tao library consumer</Text>
            <library.Provider instance={instance}>
              <Greeting Name="Ada" />
            </library.Provider>
          </View>
        )
      }
    `,
  },
]

function serializeLibraryProjectManifest(): string {
  return Json.Print({
    name: 'tao-library-consumer',
    private: true,
    type: 'module',
    scripts: { check: 'tsc --project tsconfig.json' },
    tao: {
      compile: {
        entry: '../tao/Library.tao',
        name: '@tao-dev/ts-lib-example',
      },
      run: { entry: 'Consumer.tsx', name: 'Tao Library Consumer' },
    },
    dependencies: {
      '@tao-dev/ts-lib-example': 'file:../../.tao/cache/sessions/.cli/libraries/Demo',
      '@expo/metro-runtime': '57.0.17',
      'expo': '57.0.30',
      'react-dom': '19.2.3',
      'react': '19.2.3',
      'react-native': '0.86.3',
      'react-native-web': '0.21.0',
    },
    devDependencies: { '@types/react': '~19.2.0', 'typescript': '5.9.3' },
  }) + '\n'
}

function serializeLibraryProjectTypeScript(): string {
  return Json.Print({
    extends: 'expo/tsconfig.base',
    compilerOptions: {
      strict: true,
      noEmit: true,
      jsx: 'react-jsx',
      target: 'ESNext',
      module: 'ESNext',
      moduleResolution: 'Bundler',
      preserveSymlinks: true,
      allowSyntheticDefaultImports: true,
      skipLibCheck: true,
      types: ['react'],
    },
    include: ['*.tsx'],
  }) + '\n'
}
