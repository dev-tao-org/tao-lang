/** Localhost identifies the IPv4 loopback address for local services. */
export const Localhost = '127.0.0.1'

/** localhostUrl formats a loopback URL with an explicit port and HTTP by default. */
export function localhostUrl(port: number, scheme = 'http'): string {
  return `${scheme}://${Localhost}:${port}`
}
