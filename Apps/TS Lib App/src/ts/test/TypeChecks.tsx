import { Greeting, LanguageFeatures } from '@tao-dev/ts-lib-example'
import { Caption } from '@tao-dev/ts-lib-example/@cards'
import { DetailedCard } from '@tao-dev/ts-lib-example/@cards/details'

const valid = (
  <>
    <Greeting First="Ada" Second="Lovelace" />
    <Caption Value="Card" />
    <DetailedCard Value="Detail" />
    <LanguageFeatures Name="Ada" />
  </>
)
// @ts-expect-error Missing required Second prop.
const missing = <Greeting First="Ada" />
// @ts-expect-error Wrong text prop type.
const wrong = <Greeting First={7} Second="Lovelace" />
// @ts-expect-error Unknown named prop.
const unknown = <Greeting First="Ada" Second="Lovelace" Third="No" />
// @ts-expect-error New published views retain their required text parameter.
const missingFeatureName = <LanguageFeatures />
// @ts-expect-error Private Tao helper has no package export.
import Hidden from '@tao-dev/ts-lib-example/PrivateGreeting'
// @ts-expect-error A package-visible view still requires selection in publish.
import { PackageScope } from '@tao-dev/ts-lib-example'
// @ts-expect-error Folder-visible views are internal to the compiled package.
import { Unselected } from '@tao-dev/ts-lib-example/@cards'
// @ts-expect-error A package subfolder has its own export path.
import { DetailedCard as FlattenedCard } from '@tao-dev/ts-lib-example/@cards'
// @ts-expect-error Dependencies are internal to the library.
import Text from '@tao-dev/ts-lib-example/tao/ui/Text'
// @ts-expect-error Internal scope is missing from package exports.
import Internal from '@tao-dev/ts-lib-example/ts/LibraryScope'
