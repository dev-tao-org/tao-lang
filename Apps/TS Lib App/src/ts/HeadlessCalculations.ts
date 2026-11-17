import { FormatCaption } from '@tao-dev/ts-lib-example'

const text: string = FormatCaption({ Value: 'Grace' })

if (false) {
  // @ts-expect-error The exported signature accepts named arguments.
  FormatCaption('Grace')
  // @ts-expect-error The value must be text.
  FormatCaption({ Value: 7 })
}

console.log(text)
