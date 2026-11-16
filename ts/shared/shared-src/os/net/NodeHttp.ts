import { Errors } from '../../universal/universal'
import { Buffer as NodeBuffer, type IncomingRequest } from '../bridges/Bridge_node/Bridge_node'

/** IncomingRequest describes a streaming Node HTTP request. */
export type { IncomingRequest } from '../bridges/Bridge_node/Bridge_node'

/** OutgoingResponse describes a response owned by an existing Node HTTP server. */
export type { OutgoingResponse } from '../bridges/Bridge_node/Bridge_node'

/** readRequestText reads a bounded Node HTTP body and destroys the request on overflow. */
export async function readRequestText(request: IncomingRequest, limit: number, limitMessage: string): Promise<string> {
  const chunks: NodeBuffer[] = []
  let size = 0
  for await (const chunk of request) {
    const bytes = NodeBuffer.isBuffer(chunk) ? chunk : NodeBuffer.from(chunk)
    size += bytes.length
    if (size > limit) {
      request.destroy()
      Errors.ThrowUserInput(limitMessage)
    }
    chunks.push(bytes)
  }
  return NodeBuffer.concat(chunks).toString('utf8')
}
