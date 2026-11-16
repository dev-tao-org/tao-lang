import * as WebHost from '../os/bridges/Bridge_browser/Bridge_browser'

/** Controller owns a signal and can abort work that listens to it. */
export type Controller = WebHost.AbortController

/** createController creates a cancellation source for work that accepts an abort signal. */
export function createController(): Controller {
  return new WebHost.AbortController()
}
