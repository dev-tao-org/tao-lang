# Specifications

- Write for people building apps with Tao. These files explain the language: syntax, semantics and observable behavior, independent of this repository's implementation.
- Put repository architecture, contributor commands, setup, verification, profiling and implementation notes in `Docs/Dev Env/`, not here. Product commands may appear when they help a Tao user exercise the language feature.
- Write one file per coherent reader topic, such as Live Previews or Tests; split when understanding one topic does not require the other, rather than by implementation package or individual syntax rule.
- Follow `Live Previews.md`: a title ending in `WIP`, one sentence describing the feature and nothing else before the main usage code block, then short explanatory paragraphs under `####` titles. Use a short code snippet as a paragraph title when it identifies the behavior. Keep examples coherent and explanations succinct; omit exhaustive syntax lists, conversational history and implementation task lists.
- Keep examples and explanations aligned with implemented behavior. Clearly distinguish agreed future behavior from what currently runs; preserve agreed future behavior when updating an existing file.

````markdown
# <Feature title> WIP

<One sentence describing the feature.>

```tao
<Feature usage>
```

#### `<Short syntax example>`

<Short explanation of its behavior.>

#### <Another relevant part>

<Short explanation, including availability when needed.>
````
