# Local State and Data Drafts

Tao automates syncing state with datasources, supports view-local state, and locally persisted values.

It also supports detached, in-memory drafts for preparing creates and updates; a draft does not write to a datasource until an explicit create or update action.

This document proposes future language behavior; these examples are not yet executable.

```tao
use Button, Col, Text, TextInput from @tao/ui

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

## Draft lifetime

`state Draft = draft Item` initializes once for the mounted `ItemCrud` instance. Ordinary rerenders and datasource refreshes do not recreate the draft or discard edits.

Repeated item views retain their state by stable data-item identity, so reordering the query does not move one item's edits into another item. Removing a view ends its local draft lifetime.

TODO: If a retained view receives a different item's identity, should its draft reset automatically, or should the caller explicitly replace the view instance?

## Decisions and remaining questions

Stored data lists are has-many relations to other data items; scalar lists such as `Parts [text]` are not supported in stored data. This does not prohibit ordinary in-memory lists of scalar values.

TODO: What is the draft's dirty baseline? Specify whether reverting a field to its original value clears its dirty status, and whether a successful save advances that baseline.

### TODO: Editing related items through a draft

The original scalar-list example raised a question: could a loop value be a distinct, writable reference whose edits update its source, rather than an ordinary `text` value? The developer suggested a reference type; an alternative would require explicitly replacing the source list element. Both introduce element identity and update semantics that ordinary scalar values do not have.

The agreed has-many-only restriction removes that need from this example: `Part` is a data item and the input targets `Part.Name`, using a normal property binding rather than a writable scalar loop variable.

TODO: Decide whether `draft Item` includes detached drafts of related `Parts`, or only their references. If only references are copied, editing `Part.Name` could update live data before the parent Save button is pressed; the intended isolation must be explicit before implementing this example.

TODO: Specify how to create and add a detached related part, and whether saving the parent also creates or updates related items atomically. The example deliberately omits the former scalar Add Part operation until this is decided.

TODO: Decide whether the create form clears or replaces its draft after a successful create, to avoid accidentally submitting it twice.

## Implementation notes:

- [ ] Drafts may want to keep a link of the original data object, and declare what to do if the linked object is updated.
  - [ ] It may also want to specify what should happen when a draft is saved, if the linked object is different when retrieved from server than it was when the draft was created (to avoid overwriting changes).
- [ ] Only draft-modified properties get added to the update.
