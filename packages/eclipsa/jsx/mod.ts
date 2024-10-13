import type { JSX } from './jsx-runtime.ts'

const renderChildable = (childable: JSX.Childable): string =>
  (childable && typeof childable === 'object' && 'type' in childable)? renderToString(childable): String(childable)

export const renderToString = (elem: JSX.Element): string => {
  if (typeof elem.type === 'function') {
    return renderToString(elem.type(elem.props))
  }
  const attrs = elem.props
  delete attrs.children
  console.log(elem)
  return `<${elem.type} ${
    Object.entries(attrs).map(([k, v]) => `${k}="${v}"`).join(' ')
  }>${
    Array.isArray(elem.children) ? elem.children?.map(renderChildable).join('') : renderChildable(elem.children)
  }</${elem.type}>`
}
