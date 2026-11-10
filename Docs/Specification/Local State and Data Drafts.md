# Local State and Data Drafts WIP

Proposed local state and detached in-memory drafts support editing datasource values before explicitly saving them; these examples are not yet executable.

```tao
use tao@ui Button, Col, Text, TextInput

data Items / Item {
   Name text,
   Parts,
}

data Parts / Part {
   Name text,
}

view ItemList {
   query Items = Items with { order by Name }
   render Col {
      Create
      loop Items / Item {
         ItemCrud(Item)
      }
   }
}

view Create {
   state Draft = draft Item { Name: "New Item" }
   render Col {
      TextInput(Draft.Name)
      Button("Create Item") {
         on press -> { create Item with Draft }
      }
   }
}

view ItemCrud(Item) {
   state Draft = draft Item
   render Col {
      TextInput(Draft.Name)
      Text("Parts")
      Button("Save Changes") {
         on press -> { update Item with Draft }
      }
      loop Draft.Parts / Part {
         TextInput(Part.Name)
      }
   }
}
```

#### Local state

The proposed model includes view-local and locally persisted values alongside datasource-synced
state; detached drafts prepare changes without immediately syncing them.

#### `state Draft = draft Item`

A draft initializes once per mounted view instance; rerenders and datasource refreshes do not
discard edits. Repeated item views retain state by stable data-item identity across reordering;
removing a view ends its draft lifetime.

#### `create Item with Draft` and `update Item with Draft`

A draft does not write to a datasource until an explicit create or update. Updates are intended
to include only draft-modified properties.

#### Related items

Stored data lists are has-many relations, so `Parts` contains `Part` items rather than scalar
values. `TextInput(Part.Name)` targets a data-item property. Ordinary in-memory scalar lists remain
allowed; this example does not introduce writable scalar loop references.

#### Draft identity — unresolved

If a retained view receives a different item's identity, should its draft reset automatically or
must the caller replace the view instance?

#### Dirty state and source changes — unresolved

What establishes the dirty baseline, does reverting a field clear it, and does saving advance it?
Decide whether drafts track their original datasource item and how saving handles concurrent
source changes.

#### Related drafts — unresolved

Does `draft Item` copy related items into detached drafts or retain their references? References
could make `Part.Name` edits affect live data before Save. Define related-item creation and whether
saving a parent also saves related changes atomically; the example omits adding related parts
until those semantics are settled.

#### Create-form reset — unresolved

Decide whether a successful create clears or replaces the draft to prevent accidental resubmission.
