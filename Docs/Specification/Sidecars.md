# TypeScript Sidecars WIP

A Tao view can delegate its implementation to a named React component in a TypeScript sidecar.

```tao
app Calendar { root FormattedDate }

package view FormattedDate(Value text) from ./FormattedDate.tsx
```

#### `package view FormattedDate(Value text) from ./FormattedDate.tsx`

The named component export implements the view; declared parameters currently use Tao's `text`
type and become same-named string props. Tao checks the component against its generated contract.

```tsx
import { format } from 'date-fns'

export function FormattedDate(props: { Value: string }) {
  return <time>{format(new Date(props.Value), 'PPP')}</time>
}
```

#### Module boundaries

Sidecars, relative helpers and symlink targets must remain inside their owning project and named
module. npm imports resolve through that module's managed dependency graph.

#### Checked snapshots

Tao stages checked source, helpers and supported assets in immutable snapshots. Unchanged inputs
reuse their snapshot; changing Tao alone does not recheck an unchanged sidecar graph. Failed checks
preserve the last prepared snapshot, and damaged generated snapshot metadata gets a new snapshot.

#### Watched previews

Previews observe sidecar helpers and Tao files. After 128 distinct snapshots, Tao preserves the last
working preview and requests a restart; restarting reclaims session snapshots without reinstalling
dependencies.

#### `tao add @calendar --npm date-fns --yes`

Adding writes an exact npm pin and prepares reachable modules. Conflicting direct versions,
incompatible peers, and duplicate framework/native singletons are rejected; ordinary private
transitive versions are allowed. Transitive aliases retain target identities for version and
singleton checks, and existing mixed-case npm package names are supported.

#### `tao setup Calendar.tao --repair --yes`

Generated manifests, TypeScript configurations and resolution links belong to Tao; edit requirements
and use setup instead of editing generated files. Manifests and configurations are read-only, and
unexpected changes stop compilation with the owning declaration and repair command. Shared
TypeScript defaults live under `.tao/cache/sidecars/`.

#### Repair ownership

Repair uses the durable lock and surviving generated files to prove ownership, preserving authored
or uncertain files and naming blocked paths. Restore a missing durable lock from version control;
repair does not resolve a replacement graph.

#### Host-specific installations

Installed trees belong to the preparing OS, architecture and bundled Bun version. On a different
host or Bun version, explicit preparation rebuilds from the unchanged durable lock. Changed module
requirements resolve a new graph; unchanged graphs retain their pins.

#### Sessions and consumers

Named sessions share the app's dependency graph. A live external module supports one consumer's
editor configuration; another consumer must use a separate source directory. Concurrent
preparation or cleanup reports busy tooling instead of overwriting metadata.

#### Cleanup

Cleaning a consumer removes its unchanged generated metadata and package links from live
dependency modules. Cleaning a producer preserves metadata owned by an active consumer.

#### `tao test-sidecars @calendar`

Runs a local module's tests with Tao's pinned Bun, offering required setup before continuing.

#### Native dependencies

Source and sidecar validation do not prove native packages were rebuilt or shipped; platform
rebuild and distribution workflows remain separate.
