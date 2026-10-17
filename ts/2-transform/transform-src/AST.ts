/** Node represents a semantic node implemented by the first transformer piece. */
export type Node = File | AppDeclaration | Name

/** File contains the declarations in one source snapshot. */
export type File = {
  readonly kind: 'File'
  readonly declarations: readonly AppDeclaration[]
}

/** AppDeclaration names an app and its unresolved root view. */
export type AppDeclaration = {
  readonly kind: 'AppDeclaration'
  readonly name: Name
  readonly root: Name
}

/** Name preserves an authored identifier without resolving it. */
export type Name = {
  readonly kind: 'Name'
  readonly value: string
}

/** Origin locates a semantic node using half-open UTF-16 source offsets. */
export type Origin = {
  readonly start: number
  readonly end: number
}

/** Document owns a semantic root and its source origins without retaining CST nodes. */
export type Document = {
  readonly root: File
  readonly origins: ReadonlyMap<Node, Origin>
}
