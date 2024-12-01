interface ComponentResult {
  (): void
  vars: Record<string, unknown>
}

export const createComponentResult = (vars: Record<string, unknown>, elem: ComponentResult) => {
  elem.vars = vars

  return elem
}
