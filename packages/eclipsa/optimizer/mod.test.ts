import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildFile } from './mod.ts'
import { assertEquals } from '@std/assert'

Deno.test('Main', async () => {
  const isUpdateSnapshot = Deno.args.includes('--update')

  const optimizerDir = path.join(fileURLToPath(import.meta.url), '..')
  const testsDir = path.join(optimizerDir, 'tests')
  for await (const testFile of Deno.readDir(testsDir)) {
    console.info(`Testing with snapshots... ${testFile.name}`)

    const filePath = path.join(testsDir, testFile.name)
    const tsx = await Deno.readTextFile(filePath)

    const built = await buildFile(tsx)
    if (!built) {
      continue
    }
    let snapshot = `// ================= ENTRY (${testFile.name}) ==\n${tsx}\n\n`
    for (const [name, {id, code}] of built.client) {
      snapshot += `// ================= ${name} (${id}) ==\n${code}\n\n`
    }
    const snapShotPath = path.join(optimizerDir, 'snapshots', testFile.name + '.snap')

    if (isUpdateSnapshot) {
      await Deno.writeTextFile(snapShotPath, snapshot)
    } else {
      assertEquals(snapshot, await Deno.readTextFile(snapShotPath))
    }
  }
})
