import { jsxDEV } from 'eclipsa/jsx-dev-runtime'
import { describe, expect, it } from 'vitest'
import { __eclipsaComponent } from './internal.ts'
import { renderSSR } from './ssr.ts'
const Projected = __eclipsaComponent(
  (props) =>
    /* @__PURE__ */ jsxDEV('span', { children: props.label }, void 0, false, {
      fileName: 'packages/eclipsa/core/render-prop-resume.test.ts',
      lineNumber: 6,
      columnNumber: 33,
    }),
  'projected-symbol',
  () => [],
  { label: 1 },
)
const Probe = __eclipsaComponent(
  (props) =>
    /* @__PURE__ */ jsxDEV(
      'section',
      {
        children: [
          /* @__PURE__ */ jsxDEV('div', { children: props.aa }, void 0, false, {
            fileName: 'packages/eclipsa/core/render-prop-resume.test.ts',
            lineNumber: 15,
            columnNumber: 7,
          }),
          /* @__PURE__ */ jsxDEV('div', { children: props.children }, void 0, false, {
            fileName: 'packages/eclipsa/core/render-prop-resume.test.ts',
            lineNumber: 16,
            columnNumber: 7,
          }),
        ],
      },
      void 0,
      true,
      {
        fileName: 'packages/eclipsa/core/render-prop-resume.test.ts',
        lineNumber: 14,
        columnNumber: 5,
      },
    ),
  'probe-symbol',
  () => [],
  { aa: 1, children: 1 },
)
describe('render props resume payload', () => {
  it('serializes projection slot props and children into the resume payload', () => {
    const { html, payload } = renderSSR(() =>
      /* @__PURE__ */ jsxDEV(
        Probe,
        {
          aa: /* @__PURE__ */ jsxDEV(Projected, { label: 'prop content' }, void 0, false, {
            fileName: 'packages/eclipsa/core/render-prop-resume.test.ts',
            lineNumber: 27,
            columnNumber: 18,
          }),
          children: /* @__PURE__ */ jsxDEV(
            Projected,
            { label: 'children content' },
            void 0,
            false,
            {
              fileName: 'packages/eclipsa/core/render-prop-resume.test.ts',
              lineNumber: 28,
              columnNumber: 9,
            },
          ),
        },
        void 0,
        false,
        {
          fileName: 'packages/eclipsa/core/render-prop-resume.test.ts',
          lineNumber: 27,
          columnNumber: 7,
        },
      ),
    )
    expect(html).toContain('prop content')
    expect(html).toContain('children content')
    expect(html).toContain('ec:s:c0:aa:0:start')
    expect(html).toContain('ec:s:c0:children:0:start')
    expect(payload.components['c0']?.projectionSlots).toEqual({
      aa: 1,
      children: 1,
    })
    const props = payload.components['c0']?.props
    expect(props?.__eclipsa_type).toBe('object')
    expect(props?.entries).toEqual(
      expect.arrayContaining([
        ['aa', expect.objectContaining({ kind: 'render', token: 'jsx' })],
        ['children', expect.objectContaining({ kind: 'render', token: 'jsx' })],
      ]),
    )
  })
})
