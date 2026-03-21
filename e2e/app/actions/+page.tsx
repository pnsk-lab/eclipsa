import {
  ACTION_FORM_FIELD,
  action$,
  loader$,
  useSignal,
  validator,
  type MetadataContext,
  type ActionMiddleware,
  type LoaderMiddleware,
} from 'eclipsa'
import { z } from 'zod'

export const metadata = ({ url }: MetadataContext) => ({
  canonical: url.pathname,
  openGraph: {
    title: 'E2E Actions OG',
  },
  title: `Actions | ${url.pathname}`,
  twitter: {
    card: 'summary',
    title: 'E2E Actions Twitter',
  },
})

const requestMeta: ActionMiddleware<{
  Variables: {
    traceId: string
  }
}> = async (c, next) => {
  c.set('traceId', 'trace-e2e')
  await next()
}

const loaderMeta: LoaderMiddleware<{
  Variables: {
    traceId: string
  }
}> = async (c, next) => {
  c.set('traceId', 'trace-loader')
  await next()
}

const useStatsLoader = loader$(loaderMeta, async (c) => {
  return {
    label: 'loader-ready',
    traceId: c.var.traceId,
  }
})

const sumSchema = z
  .object({
    left: z.string(),
    right: z.string(),
  })
  .refine((value) => Number.isFinite(Number(value.left)) && Number.isFinite(Number(value.right)), {
    message: 'left and right must be numeric strings',
  })
  .transform((value) => ({
    left: Number(value.left),
    right: Number(value.right),
  }))

const useSumAction = action$(requestMeta, validator(sumSchema), async (c) => {
  const total = c.var.input.left + c.var.input.right
  return {
    label: `${c.var.input.left} + ${c.var.input.right}`,
    total,
    traceId: c.var.traceId,
  }
})

const useFormSumAction = action$(requestMeta, validator(sumSchema), async (c) => {
  const left = c.var.input.left
  const right = c.var.input.right
  const total = left + right
  return {
    label: `${left} + ${right}`,
    total,
    traceId: c.var.traceId,
  }
})

export default () => {
  const left = useSignal('20')
  const right = useSignal('22')
  const lastResolved = useSignal('No result yet')
  const lastLoaded = useSignal('No manual load yet')
  const action = useSumAction()
  const formAction = useFormSumAction()
  const loader = useStatsLoader()
  const lastFormInput = formAction.lastSubmission?.input as
    | {
        left?: string
        right?: string
      }
    | undefined
  const formLeft = useSignal(lastFormInput?.left ?? '7')
  const formRight = useSignal(lastFormInput?.right ?? '8')

  return (
    <section>
      <h2>Action Playground</h2>
      <p>Hono-style middleware and validator(schema) example.</p>
      <section>
        <h3>Loader Playground</h3>
        <p data-testid="loader-loading">loader loading: {String(loader.isLoading)}</p>
        <p data-testid="loader-data">loader data: {loader.data?.label ?? 'none'}</p>
        <p data-testid="loader-error">
          loader error: {loader.error ? JSON.stringify(loader.error) : 'no error'}
        </p>
        <p data-testid="loader-last">loader last: {lastLoaded.value}</p>
        <button
          type="button"
          onClick$={async () => {
            const result = await loader.load()
            lastLoaded.value = `${result.label} (${result.traceId})`
          }}
        >
          Reload loader
        </button>
      </section>
      <label>
        Left
        <input
          name="left"
          onInput$={(event: InputEvent) => {
            left.value = (event.currentTarget as HTMLInputElement).value
          }}
          value={left.value}
        />
      </label>
      <label>
        Right
        <input
          name="right"
          onInput$={(event: InputEvent) => {
            right.value = (event.currentTarget as HTMLInputElement).value
          }}
          value={right.value}
        />
      </label>
      <button
        type="button"
        onClick$={async () => {
          const result = await action.action({
            left: left.value,
            right: right.value,
          })
          lastResolved.value = `${result.label} = ${result.total} (${result.traceId})`
        }}
      >
        Run action
      </button>
      <p data-testid="action-pending">action pending: {String(action.isPending)}</p>
      <p data-testid="action-result">action result: {action.result?.total ?? 'none'}</p>
      <p data-testid="action-last">action last: {lastResolved.value}</p>
      <p data-testid="action-error">
        action error: {action.error ? JSON.stringify(action.error) : 'no error'}
      </p>
      <section>
        <h3>Form Action</h3>
        <p>Uses the same action$ transport through native form submission.</p>
        <form data-e-action-form={formAction.formActionId} method="post">
          <input name={ACTION_FORM_FIELD} type="hidden" value={formAction.formActionId} />
          <label>
            Form Left
            <input
              name="left"
              onInput$={(event: InputEvent) => {
                formLeft.value = (event.currentTarget as HTMLInputElement).value
              }}
              value={formLeft.value}
            />
          </label>
          <label>
            Form Right
            <input
              name="right"
              onInput$={(event: InputEvent) => {
                formRight.value = (event.currentTarget as HTMLInputElement).value
              }}
              value={formRight.value}
            />
          </label>
          <button type="submit">Submit form action</button>
        </form>
        <p data-testid="form-pending">form pending: {String(formAction.isPending)}</p>
        <p data-testid="form-result">form result: {formAction.result?.total ?? 'none'}</p>
        <p data-testid="form-last">
          form last:{' '}
          {formAction.lastSubmission
            ? `${String(formAction.lastSubmission.input.left)} + ${String(formAction.lastSubmission.input.right)}`
            : 'No form submission yet'}
        </p>
        <p data-testid="form-error">
          form error: {formAction.error ? JSON.stringify(formAction.error) : 'no error'}
        </p>
      </section>
    </section>
  )
}
