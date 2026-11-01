import { Addr, Errors } from '@shared'
import { FileSystem, Http, Path, Platform, Repo } from '@shared/os'

/** FixtureRegistry exposes the test registry URL and its cleanup operation. */
export type FixtureRegistry = { url: string; stop(force?: boolean): void }

const FixtureTarballPathRegx = /^\/tarballs\/([a-z0-9-]+)\.tgz$/
/** createFixtureRegistry serves real fixture tarballs and transitive metadata over loopback. */
export async function createFixtureRegistry(root: string): Promise<FixtureRegistry> {
  const packages = await packageArtifacts(root)
  const server = Http.serve({
    hostname: Addr.Localhost,
    port: 0,
    fetch(request) {
      const path = Http.url(request.url).pathname
      const tarball = FixtureTarballPathRegx.exec(path)
      if (tarball) {
        const artifact = packages.get(tarball[1]!)
        return artifact ? Http.bytesResponse(artifact.bytes) : Http.response('missing tarball', { status: 404 })
      }
      const name = path.slice(1)
      const artifact = packages.get(name)
      return artifact
        ? Http.jsonResponse(createFixtureMetadata(name, artifact, request.url))
        : Http.response('not found', { status: 404 })
    },
  })
  const port = server.port ?? Errors.ThrowShouldNeverHappen('Fixture registry did not bind a TCP port.')
  return { url: Addr.localhostUrl(port), stop: (force?: boolean) => server.stop(force) }
}

async function packageArtifacts(root: string): Promise<Map<string, PackageArtifact>> {
  const packages = new Map<string, PackageArtifact>()
  const fixtures = Repo.resolvePath('ts/0-workspace/workspace-test/managed-fixtures/packages')
  for (const name of ['tao-fixture-label', 'string-width']) {
    const directory = Path.join(root, 'registry', name, 'package')
    await FileSystem.mkdir(Path.dirname(directory))
    await FileSystem.cp(Path.join(fixtures, name), directory, { recursive: true })
    await FileSystem.rename(Path.join(directory, 'index-js.fixture'), Path.join(directory, 'index.js'))
    const manifest = JSON.parse(await FileSystem.readFile(Path.join(directory, 'package.json'), 'utf8'))
    const archive = Path.join(root, 'registry', `${name}.tgz`)
    await Platform.capture('tar', { variadicArgs: ['-czf', archive, 'package'], cwd: Path.dirname(directory) })
    const bytes = await FileSystem.readFile(archive)
    packages.set(name, {
      bytes,
      integrity: Platform.hashBytes(bytes, 'sha512'),
      name: manifest.name,
      version: manifest.version,
      ...(manifest.dependencies ? { dependencies: manifest.dependencies } : {}),
    })
  }
  return packages
}

function createFixtureMetadata(name: string, artifact: PackageArtifact, requestUrl: string): unknown {
  const origin = Http.url(requestUrl).origin
  return {
    'name': name,
    'versions': {
      [artifact.version]: {
        name: artifact.name,
        version: artifact.version,
        ...(artifact.dependencies ? { dependencies: artifact.dependencies } : {}),
        dist: { tarball: `${origin}/tarballs/${name}.tgz`, integrity: `sha512-${artifact.integrity}` },
      },
    },
    'dist-tags': { latest: artifact.version },
  }
}

type PackageArtifact = {
  bytes: Http.Bytes
  integrity: string
  name: string
  version: string
  dependencies?: Record<string, string>
}
