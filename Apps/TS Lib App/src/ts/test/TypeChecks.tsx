import library from '@example/tao-library'
import Card from '@example/tao-library/Catalog/Greeting'
import Greeting from '@example/tao-library/Greeting'
import LanguageFeatures from '@example/tao-library/LanguageFeatures'
import React from 'react'

const instance = library.instantiate()
const valid = (
  <library.Provider instance={instance}>
    <Greeting First="Ada" Second="Lovelace" />
    <Card Value="Card" />
    <LanguageFeatures Name="Ada" />
  </library.Provider>
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
import Hidden from '@example/tao-library/PrivateGreeting'
// @ts-expect-error Unselected public view has no package export.
import Unselected from '@example/tao-library/cards/Unselected'
// @ts-expect-error Dependencies are internal to the library.
import Text from '@example/tao-library/tao/ui/Text'
// @ts-expect-error Internal bundle is not a public package path.
import Internal from '@example/tao-library/_Library.js'
