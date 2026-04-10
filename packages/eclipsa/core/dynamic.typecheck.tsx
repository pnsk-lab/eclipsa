import type { Component } from './component.ts'
import type { JSX } from '../jsx/types.ts'
import { Dynamic, type DynamicProps } from './dynamic.ts'

type Equal<Left, Right> =
  (<T>() => T extends Left ? 1 : 2) extends <T>() => T extends Right ? 1 : 2 ? true : false
type Expect<T extends true> = T

type CardProps = {
  children?: unknown
  open: boolean
}

const Card: Component<CardProps> = (_props) => null

type _AnchorProps = Expect<
  Equal<
    DynamicProps<'a'>,
    JSX.IntrinsicElements['a'] & {
      component: 'a' | null | undefined
    }
  >
>
type _CardProps = Expect<
  Equal<
    DynamicProps<typeof Card>,
    CardProps & {
      component: typeof Card | null | undefined
    }
  >
>

;<Dynamic component="a" href="/docs/getting-started/overview" rel="noreferrer" />

;<Dynamic component="button" type="button" onClick={(event) => event.currentTarget.focus()}>
  Save
</Dynamic>

;<Dynamic component={Card} open />

;<Dynamic component={Card} open>
  Content
</Dynamic>

;<Dynamic component={undefined} />

const invalidAnchorProps: DynamicProps<'a'> = {
  component: 'a',
  // @ts-expect-error anchor props should not accept button-only attributes.
  disabled: true,
}

void invalidAnchorProps

// @ts-expect-error custom component props must match the selected component.
;<Dynamic component={Card} href="/broken" />

// @ts-expect-error required component props remain required.
;<Dynamic component={Card} />
