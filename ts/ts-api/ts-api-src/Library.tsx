import { View } from '@runtime/client'
import React from '@runtime/client/Bridge_react/Bridge_react'
import { Errors } from '@shared'

/** LibraryViews maps published paths to their initialized Tao views. */
export type LibraryViews = Readonly<Record<string, View>>

/** LibraryInstance owns one isolated initialization of a compiled Tao library. */
export type LibraryInstance = {
  readonly views: LibraryViews
  readonly owner: object
  readonly disposed: boolean
  dispose(): void
}

/** LibraryProviderProps supplies an explicit borrowed instance to a React subtree. */
export type LibraryProviderProps = { instance: LibraryInstance; children?: React.ReactNode }

/** Library supplies stable components with their matching instance context. */
export type Library = {
  instantiate(): LibraryInstance
  Provider: React.ComponentType<LibraryProviderProps>
  useInstance(): LibraryInstance
}

type OptionalLibraryInstance = LibraryInstance | undefined

/** createLibrary defines one library identity without initializing its module scopes. */
export function createLibrary(initialize: () => LibraryViews): Library {
  const owner = {}
  const context = React.createContext<OptionalLibraryInstance>(undefined)
  return {
    instantiate() {
      let disposed = false
      const views = initialize()
      return {
        views,
        owner,
        get disposed() {
          return disposed
        },
        dispose() {
          disposed = true
        },
      }
    },
    Provider({ instance, children }) {
      requireMatchingInstance(instance, owner)
      return React.createElement(context.Provider, { value: instance }, children)
    },
    useInstance() {
      const instance = React.useContext(context)
      if (!instance) {
        Errors.ThrowUserInput('A published Tao view requires its library.Provider.')
      }
      requireMatchingInstance(instance, owner)
      return instance
    },
  }
}

function requireMatchingInstance(instance: LibraryInstance, owner: object): void {
  if (instance.owner !== owner) {
    Errors.ThrowUserInput('A Tao library provider received an instance from a different library.')
  }
  if (instance.disposed) {
    Errors.ThrowUserInput('A disposed Tao library instance cannot render.')
  }
}
