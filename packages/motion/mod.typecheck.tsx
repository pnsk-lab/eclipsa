import type { JSX } from 'eclipsa'
import { motion } from './mod.ts'

type Equal<Left, Right> =
  (<T>() => T extends Left ? 1 : 2) extends <T>() => T extends Right ? 1 : 2 ? true : false
type Expect<T extends true> = T

type MotionDivProps = Parameters<typeof motion.div>[0]
type MotionAnchorProps = Parameters<typeof motion.a>[0]
type MotionButtonProps = Parameters<(typeof motion)['button']>[0]
const MotionSection = motion.create('section')

type _MotionDivRef = Expect<Equal<MotionDivProps['ref'], JSX.IntrinsicElements['div']['ref']>>
type _MotionAnchorHref = Expect<
  Equal<MotionAnchorProps['href'], JSX.IntrinsicElements['a']['href']>
>
type _MotionButtonType = Expect<
  Equal<MotionButtonProps['type'], JSX.IntrinsicElements['button']['type']>
>

;<motion.div
  animate={{ opacity: 1, x: 12 }}
  class="card"
  onClick={(event) => {
    const currentTarget: HTMLDivElement = event.currentTarget
    void currentTarget
  }}
  ref={{ value: undefined as HTMLDivElement | undefined }}
/>

;<motion.a href="/docs" rel="noreferrer" />

;<motion.button type="button" />

;<MotionSection class="shell" />

// @ts-expect-error div props should not accept anchor-only attributes.
;<motion.div href="/broken" />

// @ts-expect-error button type stays constrained to valid button modes.
;<motion.button type="link" />
