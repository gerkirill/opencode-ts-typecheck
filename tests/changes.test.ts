import assert from "node:assert/strict"
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { snapshot } from "../src/changes.js"

async function fixture(t: { after(fn: () => Promise<void>): void }) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "typecheck-changes-"))
  t.after(() => rm(dir, { recursive: true, force: true }))
  return dir
}

test("stable fingerprint includes source families, JSON inputs, configs and locks, including dist", async (t) => {
  const dir = await fixture(t)
  let previous = await snapshot(dir)
  assert.equal(await snapshot(dir), previous)
  for (const file of ["a.ts", "a.tsx", "a.js", "a.jsx", "a.mts", "a.cts", "a.mjs", "a.cjs", "a.d.ts",
    "data.json", "tsconfig.jsonc", "package.json", "package-lock.json", "npm-shrinkwrap.json",
    "pnpm-lock.yaml", "yarn.lock", "bun.lock", "bun.lockb", "dist/generated.ts"]) {
    await mkdir(path.dirname(path.join(dir, file)), { recursive: true })
    await writeFile(path.join(dir, file), "first")
    const added = await snapshot(dir)
    assert.notEqual(added, previous, `addition: ${file}`)
    await writeFile(path.join(dir, file), "changed")
    const changed = await snapshot(dir)
    assert.notEqual(changed, added, `content: ${file}`)
    await rm(path.join(dir, file))
    assert.equal(await snapshot(dir), previous, `deletion: ${file}`)
    previous = await snapshot(dir)
  }
})

test("ignores metadata, irrelevant files, and internal/external symlinks", async (t) => {
  const dir = await fixture(t)
  const outside = await fixture(t)
  const initial = await snapshot(dir)
  await writeFile(path.join(dir, "README.md"), "irrelevant")
  for (const folder of [".git", "node_modules", ".slim", ".artifacts"]) {
    await mkdir(path.join(dir, folder))
    await writeFile(path.join(dir, folder, "ignored.ts"), "ignored")
  }
  await writeFile(path.join(outside, "external.ts"), "outside")
  await symlink(outside, path.join(dir, "external"))
  await symlink(path.join(outside, "external.ts"), path.join(dir, "linked.ts"))
  await symlink(dir, path.join(dir, "cycle"))
  assert.equal(await snapshot(dir), initial)
  await writeFile(path.join(outside, "external.ts"), "changed outside")
  assert.equal(await snapshot(dir), initial)
})

test("errors and cancellation do not produce incomplete snapshots", async (t) => {
  const dir = await fixture(t)
  await assert.rejects(snapshot(path.join(dir, "missing")), /ENOENT/)
  await writeFile(path.join(dir, "file.ts"), "")
  await assert.rejects(snapshot(path.join(dir, "file.ts")), /Not a directory/)
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(snapshot(dir, controller.signal), { name: "AbortError" })
})
