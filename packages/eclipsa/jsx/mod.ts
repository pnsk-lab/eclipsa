import type { JSX } from './jsx-runtime.ts'
import { renderString } from '../core/runtime.ts'

export const renderToString = (inputElementLike: JSX.Element | JSX.Element[]): string =>
  renderString(inputElementLike)
