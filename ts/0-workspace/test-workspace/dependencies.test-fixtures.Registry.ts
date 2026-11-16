import { Json } from '@shared'
import { FS, HttpServer, Path, Platform, Repo } from '@shared/os'
import Exec from '@shared/os/exec'
import { Addr, Http } from '@shared/web'
import type { ManagedPackageVersionMap } from '../workspace-src/sidecars/ManagedModule/ManagedModuleTypes'

const NpmTarballPathRegx = /^\/tarballs\/([a-z0-9-]+)\.tgz$/
/** startManagedDependencyRegistry creates the isolated package fixtures and serves their registry data. */
export async function startManagedDependencyRegistry(root: string, requests: string[], reactVersion: string) {
  const packages = await createPackageArtifacts(root)
  const server = HttpServer.serve({
    hostname: Addr.Localhost,
    port: 0,
    fetch(request) {
      const path = Http.url(request.url).pathname
      requests.push(request.url)
      const tarball = NpmTarballPathRegx.exec(path)
      if (tarball) {
        const artifact = packages.get(tarball[1]!)
        return artifact
          ? Http.bytesResponse(artifact.bytes)
          : Http.response('missing tarball', { status: 404 })
      }
      const name = path.slice(1)
      const artifact = packages.get(name)
      return artifact
        ? Http.jsonResponse(createFixtureMetadata(name, artifact, request.url, reactVersion))
        : Http.response('not found', { status: 404 })
    },
  })
  return { packages, server }
}

type PackageArtifact = { bytes: Http.Bytes; integrity: string; dependencies?: ManagedPackageVersionMap }

/** ManagedDependencyRegistryPackages maps fixture names to registry package artifacts. */
export type ManagedDependencyRegistryPackages = Map<string, PackageArtifact>

async function createPackageArtifacts(root: string): Promise<Map<string, PackageArtifact>> {
  const fixtures = Repo.resolvePath('ts/0-workspace/test-workspace/managed-fixtures/packages')
  const packages = new Map<string, PackageArtifact>()
  for (const name of ['react', 'tao-fixture-label', 'string-width']) {
    const directory = Path.join(root, 'registry', name, 'package')
    await FS.mkdir(Path.dirname(directory))
    await FS.cp(Path.join(fixtures, name), directory, { recursive: true })
    await FS.rename(Path.join(directory, 'index-js.fixture'), Path.join(directory, 'index.js'))
    const manifest = Json.Parse(
      await FS.readFile(Path.join(directory, 'package.json'), 'utf8'),
    ) as RegistryFixtureManifest
    const archive = Path.join(root, 'registry', `${name}.tgz`)
    await Exec.captureStdout('tar', ['-czf', archive, 'package'], { cwd: Path.dirname(directory) })
    const bytes = await FS.readFile(archive)
    packages.set(name, {
      bytes,
      integrity: Platform.hashBytes(bytes, 'sha512'),
      ...(manifest.dependencies ? { dependencies: manifest.dependencies } : {}),
    })
  }
  return packages
}

function createFixtureMetadata(
  name: string,
  artifact: PackageArtifact,
  requestUrl: string,
  reactVersion: string,
): unknown {
  const version = resolveFixtureVersion(name, reactVersion)
  const origin = Http.url(requestUrl).origin
  return {
    'name': name,
    'versions': {
      [version]: {
        name,
        version,
        ...(artifact.dependencies ? { dependencies: artifact.dependencies } : {}),
        dist: { tarball: `${origin}/tarballs/${name}.tgz`, integrity: `sha512-${artifact.integrity}` },
      },
    },
    'dist-tags': { latest: version },
  }
}

function resolveFixtureVersion(name: string, reactVersion: string): string {
  if (name === 'react') {
    return reactVersion
  }
  if (name === 'string-width') {
    return '4.1.0'
  }
  return '1.0.0'
}

// Authored fixture output is inspected and deliberately damaged by these tests.
type RegistryFixtureManifest = { dependencies?: Record<string, string>; name: string; version: string }
