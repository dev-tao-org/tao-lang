import * as WebHost from '../../os/bridges/Bridge_browser/Bridge_browser'

/** connect opens a WebSocket on the active web host. */
export function connect(url: string): WebHost.WebSocket {
  return new WebHost.WebSocket(url)
}
