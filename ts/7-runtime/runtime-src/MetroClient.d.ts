declare module 'tao:metro-hmr-client' {
  class MetroHMRClient {
    constructor(url: string)
    on(event: string, listener: () => void): void
  }
  export default MetroHMRClient
}
