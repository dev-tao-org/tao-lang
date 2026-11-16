# Terminology WIP

This index names Tao language and authoring concepts: unmarked entries describe the current implementation, WIP marks proposed or unsettled behavior, and Legacy marks concepts from the previous implementation without promising their adoption.

## Current

#### Language and rendering

- **App**: A named runnable entry whose root selects a view.
- **View**: A reusable UI definition with parameters, lexical bindings and a final render.
  - **View instance**: One mounted use of a view, with its own bound inputs and lifetime.
  - **Render expression**: A use of a view with arguments, optional children and an optional render tag.
  - **Render tree**: Nested render expressions describing UI structure.
  - **Render tag**: An authored `#name` identifying a rendered target for interactions and assertions.
  - **Children**: Ordered nested render expressions supplied to a parent view and available to its injection through `@@children`.
- **Declaration name**: An authored Tao name that starts with an uppercase letter, such as `Main` or `Caption`. Explicit import and dependency aliases, parameters, and injection captures follow the same rule. Package paths and names supplied by the Tao SDK, such as `text`, keep their own spelling.
- **Parameter**: A declared input to a view; currently supported view parameters use `text`.
- **Argument**: A value supplied to a parameter; current view arguments bind by position.
- **Let binding**: An immutable named value in its lexical scope.
- **Text**: Tao's currently implemented string value type.
- **Scope**: The region in which a name resolves, including access to enclosing bindings.
- **Injection**: Inline TypeScript implementing a render with explicitly captured Tao values.
  - **Capture**: A named binding exposed to injected TypeScript.
- **Foreign view**: A Tao view implemented by a named exported React component.
  - **Sidecar**: An authored TypeScript file providing that component or its helpers.
- **Test**: An executable sequence that runs an app, performs interactions and checks expectations.
  - **Expectation**: An assertion about rendered text or input values.

Sources: [grammar](../../ts/1-grammar/grammar-src/treesitter-grammar.js), [view runtime](../../ts/7-runtime/runtime-src/client/View.ts), [sidecars](Sidecars.md), [tests](Tests.md).

#### Projects and dependencies

- **Project**: A source root identified by `.tao`, owning modules, dependencies and sessions.
  - **Named module**: An `@name` directory whose Tao files form an import boundary.
  - **Source file**: An authored `.tao` file containing declarations.
  - **Dependency**: An external source project or npm requirement declared with `requires`.
  - **Dependency alias**: A project-local name selecting a source dependency in imports.
  - **Import**: A `use` declaration bringing names or a namespace into scope.
  - **Visibility**: A declaration's `file`, `folder`, `package`, `project` or `public` access boundary.
  - **Session**: An isolated prepared working context using the project's dependency pins.
  - **Store**: Durable, committed `.tao/store/` data, including dependency locks.
  - **Cache**: Disposable generated data under `.tao/cache/`.

Source: [projects and dependencies](Projects%20and%20Dependencies.md).

#### Authored TypeScript runtime

- **Runtime API**: The `Tao` object exposing supported presentation and reactive capabilities to authored TypeScript.
- **Reactive expression**: A value supporting reads and change observation through the TypeScript API.
  - **Writable expression**: An expression whose value can change through `update`.
  - **Computed expression**: A pure expression derived from other expressions.
  - **Observation**: A subscription delivering the initial value and changed values until released.
- **Batch**: A synchronous boundary grouping writes before observers receive changed values.

Sources: [runtime API](Runtime%20TypeScript%20API.md), [reactive expressions](../../ts/7-runtime/runtime-src/client/ReactiveEngine.ts).

## WIP

#### Previews and visual authoring

- **Studio (WIP)**: A project authoring environment combining source editing and visual authoring.
- **Preview (WIP)**: A configured live rendering of an app or view with selected inputs, environment and display.
  - **Display (WIP)**: Rendering dimensions and platform inputs such as appearance, accessibility, locale and time, with an optional datasource default.
- **Canvas (WIP)**: A proposed Tao declaration describing a visual editing surface targeting one view and presenting one or more previews.
  - **Canvas Draft (WIP)**: A loose render expression or tree with drafting bounds, whose source spelling remains unsettled.
    - **Draft bounds (WIP)**: Canvas position and drafting width/height, independent of authored layout dimensions.
  - **Insert menu (WIP)**: A menu of views or content available for insertion.
  - **Drag preview (WIP)**: Temporary candidate rendering shown during a drag.
  - **Drop map (WIP)**: Regions mapped to source destinations where content may be dropped.
    - **Drop region (WIP)**: An area associated with a drop destination, whether or not the area is visibly indicated.
    - **Drop destination (WIP)**: A source location and insertion operation selected by a drop.
    - **Placeholder (WIP)**: A temporary layout stand-in at the selected drop destination.
- **Content placement (WIP)**: Chosen `content` syntax for placing unnamed caller content inside a view, awaiting implementation.

Source: [live previews](Live%20Previews.md); Canvas and content-placement entries record the current authoring proposal rather than executable syntax.

#### Working copies and local data

- **File working copy (WIP)**: Editable full-file source compiled separately under the original logical path, preserving its name-resolution context.
  - **View working copy (WIP)**: A view-focused editing scope within its owning file working copy.
  - **Drag insertion edit (WIP)**: A temporary source change inserting the hover placeholder into the working copy, discarded or replaced when the gesture changes.
  - **Apply (WIP)**: Publishing working-copy changes into project source.
  - **Autosave (WIP)**: Persisting local working state durably.
- **Local storage (WIP)**: Proposed ignored `.tao/local/` storage for durable local authoring state, retained across ordinary cleanup.
- **View state (WIP)**: A proposed view-local value retained across rerenders, with persistence and identity rules still being defined.
  - **Data draft (WIP)**: A detached editable data value saved through explicit create or update.

Sources: [local state and data drafts](Local%20State%20and%20Data%20Drafts.md), [current entry-source updates](../../ts/0-workspace/workspace-src/FileManager/FileManager.ts); general file working copies and `.tao/local/` are proposals.

## Legacy

#### Types and values

- **Type (Legacy)**: A user-declared contract describing a value's identity, members or supported behavior.
  - **Primitive (Legacy)**: A language-provided base type, including renderable and configurable value families.
  - **Refinement (Legacy)**: A derived type contract that fills or overrides declared configuration.
  - **Item (Legacy)**: A structured value with named fields.
  - **Case set (Legacy)**: A nominal type with a closed set of alternatives declared using `one of`.
  - **Union (Legacy)**: A type admitting values from any of its listed member types.
  - **Optional field (Legacy)**: An item or data field marked `?` that permits an absent value.
  - **Generic type parameter (Legacy)**: A named type input constrained by one or more bounds.
  - **Capability (Legacy)**: A structural contract requiring matching associated operations.
  - **Slot (Legacy)**: A declaration-owned input or configuration requirement filled by an argument or specification.
  - **Trait (Legacy)**: A data-field annotation describing defaults, relations, storage or validation metadata.
- **State (Legacy)**: A reactive mutable binding declared in Tao source.
- **Function (Legacy)**: A pure computation returning a value.
- **Action (Legacy)**: An operation that can perform effects and mutate state or data.

Sources: [previous type system](../../.x-tao-old-v1/Docs/Spec/Tao%20Type%20System.md), [previous data contracts](../../.x-tao-old-v1/Docs/Spec/Tao%20Data.md), [union validation](../../.x-tao-old-v1/packages/language/validator/validator-src/validators/types-validator.ts).

#### Data, UI and authoring

- **Data declaration (Legacy)**: A stored collection schema naming its plural collection and singular entity type.
  - **Entity (Legacy)**: An identity-bearing item in a data collection.
  - **Datasource (Legacy)**: A configured provider binding data to storage, query and write capabilities.
  - **Query (Legacy)**: A reactive selection of datasource entities.
  - **Fixture (Legacy)**: A named reusable graph of accounts and created entities for tests or previews.
- **Scene (Legacy)**: A renderable navigation destination with host-facing properties.
- **Navigation (Legacy)**: A configured view that hosts and presents destinations.
- **Design (Legacy)**: Named colors, sizes, typography and reusable styles applied to UI.
  - **Layout clause (Legacy)**: Source specifications controlling a view's geometry and presentation.
- **Named render slot (Legacy)**: A declaration-owned renderer filled and placed using `@name`, independently of ordinary parameters and children.
- **Unnamed content (Legacy)**: Caller-supplied children placed inside a view through `@@content`.
- **Loop (Legacy)**: Repeated rendering for items in a collection.
- **Conditional rendering (Legacy)**: Rendering selected by `if` or `when` branches.
- **Scenario group (Legacy)**: A named group of configured preview cases.
  - **Scenario (Legacy)**: One configured subject, device, data and environment case within a group.
- **Device (Legacy)**: A test or runtime target configuration, distinct from the proposed preview Display.

Sources: previous [data](../../.x-tao-old-v1/Docs/Spec/Tao%20Data.md), [layout and UI](../../.x-tao-old-v1/Docs/Spec/Tao%20Layout%20and%20UI.md), [design](../../.x-tao-old-v1/Docs/Spec/Tao%20Design.md), [navigation](../../.x-tao-old-v1/Docs/Spec/Tao%20Presentation%20and%20Navigation.md), [Studio](../../.x-tao-old-v1/Docs/Spec/Tao%20Studio.md).
