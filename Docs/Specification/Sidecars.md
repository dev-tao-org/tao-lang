# TypeScript Sidecars

A public Tao view can delegate its implementation to a named React component in a TypeScript file:

```tao
app Calendar { root FormattedDate }

public view FormattedDate(Value text) from ./FormattedDate.tsx
```

The component's named export implements the Tao view. Tao passes each declared parameter as a
same-named string prop:

```tsx
import { format } from 'date-fns'

export function FormattedDate(props: { Value: string }) {
  return <time>{format(new Date(props.Value), 'PPP')}</time>
}
```

Sidecar files and their relative TypeScript helpers must remain inside the owning Tao project and
named module. For example, a component can import `./format` or `./ui/Badge`, but cannot follow a
symlink outside the module or import a sibling named module by relative path. npm packages resolve
through the managed dependency graph declared by the owning module.

Before a sidecar is used for compilation, Tao checks that its named export satisfies the generated
React component contract and that declared parameters use Tao's `text` type. It stages the source,
relative helpers, and supported assets in an immutable snapshot. Unchanged inputs reuse the checked
snapshot; changed inputs receive a new one. A failed check does not replace an already prepared
snapshot. Editing Tao source alone does not require rechecking an unchanged sidecar graph.

`tao add @calendar --npm date-fns --yes` writes an exact npm pin to the module and prepares the
reachable graph. `tao prepare Calendar.tao --repair --yes` can repair generated manifests,
TypeScript configuration, and managed resolution links before preparation. Generated module
`package.json`, `tsconfig.json`, and resolution links are Tao-owned; edit the Tao requirement and
run preparation to change them. TypeScript settings extend project-shared defaults under
`.tao/cache/sidecars/`.

Module manifests and TypeScript configuration are read-only. Unexpected changes stop compilation
with the owning declaration and a repair command. Only reachable modules contribute npm packages.
Tao rejects conflicting direct versions, incompatible peers, and duplicate framework or native
packages that require one canonical installation; ordinary private transitive versions are allowed.
Use `tao test-sidecars @calendar` to run a prepared local module's tests with Tao's pinned Bun.

Installed package trees belong to the host OS and architecture that prepared them. On another
host, compilation requests preparation; preparation rebuilds the installed tree from the same
durable lock without changing the pinned dependency graph.

Named sessions in one app reuse its dependency graph. A live external module directory currently
has one consumer's editor configuration: preparing it for a different consumer fails with an
ownership diagnostic instead of replacing the first consumer's links. Separate source directories
are needed for independent consumer configurations. Concurrent preparation or cleanup of the same
module reports that its tooling is busy; it cannot overwrite another operation's metadata.

Native runtime dependencies are tracked separately from source and sidecar validation. Preparing
or changing a dependency does not establish that a native platform package has been rebuilt or
shipped. Platform-specific native rebuild and distribution workflows remain separate work.
