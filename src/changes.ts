import { createHash } from "node:crypto"
import { readdir, readFile, realpath, stat } from "node:fs/promises"
import path from "node:path"

const ignored = new Set([".git", ".hg", ".svn", "node_modules", ".slim", ".artifacts"])
const lockfiles = new Set(["package-lock.json", "npm-shrinkwrap.json", "pnpm-lock.yaml", "yarn.lock", "bun.lock", "bun.lockb"])

/** Conservative local input fingerprint. Symlinks are never traversed. */
export async function snapshot(directory: string, signal?: AbortSignal): Promise<string> {
  signal?.throwIfAborted()
  const root = await realpath(directory)
  if (!(await stat(root)).isDirectory()) throw new Error(`Not a directory: ${directory}`)
  const hash = createHash("sha256")
  const paths: string[] = []
  async function visit(relative: string): Promise<void> {
    signal?.throwIfAborted()
    const entries = await readdir(path.join(root, relative), { withFileTypes: true })
    entries.sort((a, b) => a.name.localeCompare(b.name, "en"))
    for (const entry of entries) {
      signal?.throwIfAborted()
      if (entry.isSymbolicLink() || ignored.has(entry.name)) continue
      const name = path.join(relative, entry.name)
      if (entry.isDirectory()) await visit(name)
      else if (entry.isFile() && (/\.(?:[cm]?[jt]sx?|jsonc?)$/i.test(entry.name) || lockfiles.has(entry.name))) paths.push(name)
    }
  }
  await visit("")
  paths.sort()
  for (const relative of paths) {
    signal?.throwIfAborted()
    const data = await readFile(path.join(root, relative), { signal })
    const name = Buffer.from(relative.split(path.sep).join("/"))
    hash.update(`${name.length}:`).update(name).update(`${data.length}:`).update(data)
  }
  signal?.throwIfAborted()
  return hash.digest("hex")
}
