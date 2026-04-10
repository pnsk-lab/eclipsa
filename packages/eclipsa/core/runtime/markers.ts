export type MarkerKind = 'start' | 'end'

export interface ComponentBoundaryMarker {
  id: string
  kind: MarkerKind
}

export interface ProjectionSlotMarker {
  componentId: string
  key: string
  kind: MarkerKind
  name: string
  occurrence: number
}

export interface KeyedRangeMarker {
  key: string
  kind: MarkerKind
}

export interface InsertMarker {
  key: string
}

export const COMPONENT_BOUNDARY_PROPS_CHANGED = Symbol.for(
  'eclipsa.component-boundary-props-changed',
)
export const COMPONENT_BOUNDARY_SYMBOL_CHANGED = Symbol.for(
  'eclipsa.component-boundary-symbol-changed',
)
export const INSERT_MARKER_PREFIX = 'ec:i:'

type ComponentBoundaryComment = Comment & {
  [COMPONENT_BOUNDARY_PROPS_CHANGED]?: boolean
  [COMPONENT_BOUNDARY_SYMBOL_CHANGED]?: boolean
}

const COMPONENT_BOUNDARY_MARKER_REGEX = /^ec:c:(.+):(start|end)$/
const KEYED_RANGE_MARKER_REGEX = /^ec:k:([^:]+):(start|end)$/
const PROJECTION_SLOT_MARKER_REGEX = /^ec:s:([^:]+):([^:]+):(\d+):(start|end)$/
const INSERT_MARKER_REGEX = /^ec:i:(.+)$/

const encodeProjectionSlotName = (value: string) => encodeURIComponent(value)
const decodeProjectionSlotName = (value: string) => decodeURIComponent(value)
const encodeKeyedRangeToken = (value: string | number | symbol) => encodeURIComponent(String(value))
const decodeKeyedRangeToken = (value: string) => {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

export const createComponentBoundaryMarker = (componentId: string, kind: MarkerKind) =>
  `ec:c:${componentId}:${kind}`

export const createComponentBoundaryHtmlComment = (componentId: string, kind: MarkerKind) =>
  `<!--${createComponentBoundaryMarker(componentId, kind)}-->`

export const setComponentBoundaryChangeFlags = (
  start: Comment,
  options?: {
    propsChanged?: boolean
    symbolChanged?: boolean
  },
) => {
  ;(start as ComponentBoundaryComment)[COMPONENT_BOUNDARY_PROPS_CHANGED] =
    options?.propsChanged === true
  ;(start as ComponentBoundaryComment)[COMPONENT_BOUNDARY_SYMBOL_CHANGED] =
    options?.symbolChanged === true
}

export const didComponentBoundaryPropsChange = (start: Comment) =>
  Boolean((start as ComponentBoundaryComment)[COMPONENT_BOUNDARY_PROPS_CHANGED])

export const didComponentBoundarySymbolChange = (start: Comment) =>
  Boolean((start as ComponentBoundaryComment)[COMPONENT_BOUNDARY_SYMBOL_CHANGED])

export const didComponentBoundaryChange = (start: Comment) =>
  didComponentBoundaryPropsChange(start) || didComponentBoundarySymbolChange(start)

export const createComponentBoundaryPair = (
  doc: Document,
  componentId: string,
  options?: {
    propsChanged?: boolean
    symbolChanged?: boolean
  },
) => {
  const start = doc.createComment(createComponentBoundaryMarker(componentId, 'start'))
  const end = doc.createComment(createComponentBoundaryMarker(componentId, 'end'))
  setComponentBoundaryChangeFlags(start, options)
  return {
    end,
    start,
  }
}

export const createProjectionSlotRangeKey = (
  componentId: string,
  name: string,
  occurrence: number,
) => `${componentId}:${encodeProjectionSlotName(name)}:${occurrence}`

export const createProjectionSlotMarker = (
  componentId: string,
  name: string,
  occurrence: number,
  kind: MarkerKind,
) => `ec:s:${createProjectionSlotRangeKey(componentId, name, occurrence)}:${kind}`

export const createKeyedRangeMarker = (value: string | number | symbol, kind: MarkerKind) =>
  `ec:k:${encodeKeyedRangeToken(value)}:${kind}`

export const createInsertMarker = (key: string | number) => `${INSERT_MARKER_PREFIX}${key}`

export const parseComponentBoundaryMarker = (value: string): ComponentBoundaryMarker | null => {
  const matched = value.match(COMPONENT_BOUNDARY_MARKER_REGEX)
  if (!matched) {
    return null
  }
  return {
    id: matched[1],
    kind: matched[2] as MarkerKind,
  }
}

export const parseProjectionSlotMarker = (value: string): ProjectionSlotMarker | null => {
  const matched = value.match(PROJECTION_SLOT_MARKER_REGEX)
  if (!matched) {
    return null
  }
  return {
    componentId: matched[1],
    key: createProjectionSlotRangeKey(
      matched[1],
      decodeProjectionSlotName(matched[2]),
      Number(matched[3]),
    ),
    kind: matched[4] as MarkerKind,
    name: decodeProjectionSlotName(matched[2]),
    occurrence: Number(matched[3]),
  }
}

export const parseKeyedRangeMarker = (value: string): KeyedRangeMarker | null => {
  const matched = value.match(KEYED_RANGE_MARKER_REGEX)
  if (!matched) {
    return null
  }
  return {
    key: decodeKeyedRangeToken(matched[1]),
    kind: matched[2] as MarkerKind,
  }
}

export const parseInsertMarker = (value: string): InsertMarker | null => {
  const matched = value.match(INSERT_MARKER_REGEX)
  if (!matched) {
    return null
  }
  return {
    key: matched[1],
  }
}
