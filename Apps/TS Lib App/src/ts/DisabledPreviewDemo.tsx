import DisabledPreview from '@example/tao-library/DisabledPreview'
import React from 'react'

/** DisabledPreviewDemo supplies an ordinary React boolean prop to the compiled Tao view. */
export default function DisabledPreviewDemo() {
  const [locked, setLocked] = React.useState(false)
  return (
    <>
      <button onClick={() => setLocked(!locked)}>{locked ? 'Unlock preview' : 'Lock preview'}</button>
      <DisabledPreview Locked={locked} />
    </>
  )
}
