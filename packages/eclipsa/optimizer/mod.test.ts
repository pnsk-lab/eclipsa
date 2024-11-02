import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildFile } from './mod.ts'

Deno.test('Main', async () => {
  const isUpdateSnapshot = Deno.args.includes('--update')

  const optimizerDir = path.join(fileURLToPath(import.meta.url), '..')
  const testsDir = path.join(optimizerDir, 'tests')
  for await (const testFile of Deno.readDir(testsDir)) {
    const tsx = await Deno.readTextFile(path.join(testsDir, testFile.name))

    buildFile(tsx)
  }
})
