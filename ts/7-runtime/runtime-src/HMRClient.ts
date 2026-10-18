import { PreviewPlatform } from '@shared/os'
import MetroHMRClient from 'tao:metro-hmr-client'

/** PreviewHMRClient observes Expo's actual Metro client without changing update application. */
export default class PreviewHMRClient extends MetroHMRClient {
  constructor(url: string) {
    super(url)
    this.on('update-done', () => PreviewPlatform.reportPreviewEvent('tao.update-done'))
  }
}
