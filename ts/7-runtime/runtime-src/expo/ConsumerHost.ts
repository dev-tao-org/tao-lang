import { Json } from '@shared'
import { Errors } from '@shared'
import { FS, Path } from '@shared/os'
import { consumerMetroConfiguration, createConsumerBootstrap } from '../bridges/Bridge_expo/Bridge_expo-config'
import type { RuntimePackageVersions } from '../Runtime'
import { createExpoSession, type ExpoPlatform, type ExpoSession } from './Expo/Expo'
import { writeGeneratedHost } from './GeneratedHost'

/** ConsumerHostOptions describes one generated Expo host borrowing an authored package's sole dependency install. */
export type ConsumerHostOptions = {
  directory: string
  packageDirectory: string
  entry: string
  name: string
  dependencies: RuntimePackageVersions
  devDependencies: RuntimePackageVersions
  platform?: ExpoPlatform
  library?: ConsumerLibrary
}

/** ConsumerLibrary identifies the compiled package owned by this host's session. */
export type ConsumerLibrary = { name: string; directory: string }

/** createConsumerHost writes generated Expo files beside a link to the authored package's dependencies. */
export async function createConsumerHost(options: ConsumerHostOptions): Promise<string> {
  const modules = Path.join(options.packageDirectory, 'node_modules')
  if (!FS.existsSync(Path.join(modules, 'expo'))) {
    return Errors.ThrowUserInput(
      `Install the authored package dependencies before running: ${options.packageDirectory}.`,
    )
  }
  const entry = Path.resolve(options.packageDirectory, options.entry)
  if (!Path.isWithin(options.packageDirectory, entry) || !FS.existsSync(entry)) {
    return Errors.ThrowUserInput(`tao.run.entry must name an existing component inside ${options.packageDirectory}.`)
  }
  const bootstrap = createConsumerBootstrap(Path.relative(options.directory, entry))
  await writeGeneratedHost(options.directory, {
    'Application.ts': bootstrap,
    'package.json': serializeConsumerManifest(options),
    'app.json': serializeConsumerApp(options.name, options.platform ?? 'web'),
    'metro.config.js': consumerMetroConfiguration,
    'tao-consumer.json': serializeConsumerResolution(options),
    'tsconfig.json': serializeConsumerTypeScript(),
  }, modules)
  return options.directory
}

/** startConsumerHost starts the generated host without changing the authored consumer. */
export function startConsumerHost(directory: string, platform: ExpoPlatform): Promise<ExpoSession> {
  return createExpoSession({ directory }, { platform })
}

function serializeConsumerManifest(options: ConsumerHostOptions): string {
  return Json.Print({
    name: 'tao-consumer-host',
    private: true,
    main: 'Application.ts',
    scripts: { start: 'expo start' },
    dependencies: resolveHostDependencies(options.dependencies, options.packageDirectory),
    devDependencies: resolveHostDependencies(options.devDependencies, options.packageDirectory),
  })
}

function resolveHostDependencies(versions: RuntimePackageVersions, directory: string): RuntimePackageVersions {
  return Object.fromEntries(
    Object.entries(versions).map(([name, version]) => {
      const local = version.startsWith('file:') || version.startsWith('link:')
      const specification = local ? 'file:' + Path.resolve(directory, version.slice(5)) : version
      return [name, specification]
    }),
  )
}

function serializeConsumerApp(name: string, platform: ExpoPlatform): string {
  return Json.Print({ expo: { name, slug: 'tao-consumer', platforms: [platform] } })
}

function serializeConsumerResolution(options: ConsumerHostOptions): string {
  return Json.Print({
    packageDirectory: options.packageDirectory,
    packages: Object.keys(options.dependencies),
    library: options.library,
  })
}

function serializeConsumerTypeScript(): string {
  return Json.Print({
    extends: 'expo/tsconfig.base',
    compilerOptions: { noEmit: true },
    include: ['Application.ts'],
  })
}
