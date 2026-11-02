declare module 'tao:metro-hmr-client' {
  class MetroHMRClient {
    constructor(url: string)
    on(event: string, listener: (payload?: unknown) => void): void
  }
  export default MetroHMRClient
}
