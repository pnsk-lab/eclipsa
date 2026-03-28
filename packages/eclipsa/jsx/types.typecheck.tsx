import type { BindTarget, DelegatedEvent, JSX } from './types.ts'

type Equal<Left, Right> =
  (<T>() => T extends Left ? 1 : 2) extends <T>() => T extends Right ? 1 : 2 ? true : false
type Expect<T extends true> = T

type ButtonClickHandler = NonNullable<JSX.IntrinsicElements['button']['onClick']>
type ButtonClickEvent = Parameters<ButtonClickHandler>[0]
type _ButtonClickEvent = Expect<
  Equal<ButtonClickEvent, DelegatedEvent<HTMLButtonElement, MouseEvent>>
>

type InputHandler = NonNullable<JSX.IntrinsicElements['input']['onInput']>
type InputEvent = Parameters<InputHandler>[0]
type _InputEvent = Expect<
  Equal<InputEvent, DelegatedEvent<HTMLInputElement, globalThis.InputEvent>>
>

type FormSubmitHandler = NonNullable<JSX.IntrinsicElements['form']['onSubmit']>
type FormSubmitEvent = Parameters<FormSubmitHandler>[0]
type _FormSubmitEvent = Expect<
  Equal<FormSubmitEvent, DelegatedEvent<HTMLFormElement, globalThis.SubmitEvent>>
>

type ButtonType = JSX.IntrinsicElements['button']['type']
type _ButtonType = Expect<Equal<ButtonType, 'button' | 'reset' | 'submit' | undefined>>

type InputBindValue = JSX.IntrinsicElements['input']['bind:value']
type _InputBindValue = Expect<
  Equal<InputBindValue, BindTarget<number | readonly string[] | string | undefined> | undefined>
>

type InputBindChecked = JSX.IntrinsicElements['input']['bind:checked']
type _InputBindChecked = Expect<
  Equal<InputBindChecked, BindTarget<boolean | undefined> | undefined>
>

;<button
  onClick={(event) => {
    const currentTarget: HTMLButtonElement = event.currentTarget
    const clientX: number = event.clientX
    void currentTarget
    void clientX
  }}
/>

;<input
  onInput={(event) => {
    const currentTarget: HTMLInputElement = event.currentTarget
    const value: string = event.currentTarget.value
    void currentTarget
    void value
  }}
/>

;<input bind:value={{ value: 'hello' }} />

;<input bind:checked={{ value: true }} type="checkbox" />

;<textarea bind:value={{ value: 'notes' }} />

;<select bind:value={{ value: 'option-a' }}>
  <option value="option-a">A</option>
</select>

;<form
  onSubmit={(event) => {
    const currentTarget: HTMLFormElement = event.currentTarget
    const submitter: HTMLElement | null | undefined = event.submitter
    void currentTarget
    void submitter
  }}
/>

;<div
  class="card"
  data-testid="probe"
  style={{ opacity: 1, 'max-height': '24px' }}
  ref={{ value: undefined as HTMLDivElement | undefined }}
/>

;<a href="/docs/getting-started/overview" rel="noreferrer" />

;<svg viewBox="0 0 24 24" xmlns:xlink="http://www.w3.org/1999/xlink">
  <path d="M0 0h24v24H0z" fill="none" stroke="currentColor" stroke-width="2" />
  <use xlink:href="#icon" />
</svg>

;<sodipodi:namedview pagecolor="#ffffff" bordercolor="#000000" />

// @ts-expect-error div does not accept href.
;<div href="/broken" />

// @ts-expect-error button type is restricted to valid button modes.
;<button type="link" />

// @ts-expect-error delegated event handlers must be functions.
;<button onClick="save" />

// @ts-expect-error refs must be signal-like objects with a value slot.
;<div ref="nope" />

const invalidDataAttributes: JSX.IntrinsicElements['div'] = {
  // @ts-expect-error data attributes only accept serializable primitive values.
  'data-state': { open: true },
}

void invalidDataAttributes
