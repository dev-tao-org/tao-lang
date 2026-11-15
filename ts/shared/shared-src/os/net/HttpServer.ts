import * as BunHost from '../bridges/Bridge_bun/Bridge_bun'

/** serve starts a Bun HTTP server with an explicit request handler. */
export function serve(options: BunHost.ServeOptions<undefined>): BunHost.Server<undefined> {
  return BunHost.getRuntime().serve(options)
}
