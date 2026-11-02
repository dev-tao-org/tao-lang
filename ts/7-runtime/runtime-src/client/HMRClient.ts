import * as PreviewPlatform from '@shared/os/preview'
import MetroHMRClient from 'tao:metro-hmr-client'

/** PreviewHMRClient observes Expo's actual Metro client without changing update application. */
export default class PreviewHMRClient extends MetroHMRClient {
  constructor(url: string) {
    super(url)
    PreviewPlatform.initializePreviewClient()
    this.on('update-done', () => PreviewPlatform.reportPreviewEvent('tao.update-done'))
    this.on('open', () => PreviewPlatform.reportPreviewConnection(true))
    this.on('close', () => PreviewPlatform.reportPreviewConnection(false))
    this.on('connection-error', () => PreviewPlatform.reportPreviewConnection(false))
    this.on('error', error => PreviewPlatform.reportPreviewError('build-error', describeError(error)))
  }
}

function describeError(error: unknown): string {
  if (hasErrorMessage(error)) {
    return String(error.message)
  }
  return String(error)
}

function hasErrorMessage(error: unknown): error is { message: unknown } {
  return typeof error === 'object' && error !== null && 'message' in error
}
