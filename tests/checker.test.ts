import assert from "node:assert/strict"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"
import { runCheck, selectCommand, type CheckCommand } from "../src/checker.js"

const root = fileURLToPath(new URL("..", import.meta.url))
const options = { timeoutMs: 10_000, maxOutputBytes: 64_000 }
async function fixture(t: { after(fn: () => Promise<void>): void }) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "typecheck-checker-"))
  t.after(() => rm(dir, { recursive: true, force: true }))
  return dir
}
function node(cwd: string, source: string): CheckCommand {
  return { command: process.execPath, args: ["-e", source], cwd, label: "node fixture" }
}

test("typecheck script takes precedence, preserves shell script semantics, and runs in cwd", async (t) => {
  const dir = await fixture(t)
  await writeFile(path.join(dir, "package.json"), JSON.stringify({
    scripts: { typecheck: `node -e "process.stdout.write(process.cwd())" && node -e "process.exit(0)"` },
    packageManager: "npm@11.0.0",
  }))
  const command = await selectCommand(dir)
  assert.equal(command.command, "npm")
  assert.deepEqual(command.args, ["run", "typecheck"])
  const result = await runCheck(command, options)
  assert.equal(result.kind, "passed")
  assert.ok(result.output.includes(dir))
})

test("manager selection, conflicts, malformed manifest and explicit manager", async (t) => {
  const dir = await fixture(t)
  const manifest = path.join(dir, "package.json")
  await writeFile(manifest, JSON.stringify({ scripts: { typecheck: "whatever" } }))
  assert.equal((await selectCommand(dir)).command, "npm")
  await writeFile(path.join(dir, "pnpm-lock.yaml"), "")
  assert.equal((await selectCommand(dir)).command, "pnpm")
  await writeFile(path.join(dir, "yarn.lock"), "")
  await assert.rejects(selectCommand(dir), /Conflicting/)
  await writeFile(manifest, JSON.stringify({ scripts: { typecheck: "whatever" }, packageManager: "bun@1.3.0" }))
  assert.equal((await selectCommand(dir)).command, "bun")
  await writeFile(manifest, JSON.stringify({ scripts: { typecheck: "whatever" }, packageManager: "npm;echo danger" }))
  await assert.rejects(selectCommand(dir), /packageManager/)
  await writeFile(manifest, "{broken")
  await assert.rejects(selectCommand(dir), /package.json/)
  for (const typecheck of ["", "  ", 42, null, false]) {
    await writeFile(manifest, JSON.stringify({ scripts: { typecheck } }))
    await assert.rejects(selectCommand(dir), /Invalid scripts.typecheck/)
  }
})

test("fallback runs actual TypeScript on failing and passing TSX; malformed config is unresolved", async (t) => {
  // Inside the repo so selection discovers its real installed compiler.
  const dir = await mkdtemp(path.join(root, ".checker-fixture-"))
  t.after(() => rm(dir, { recursive: true, force: true }))
  await writeFile(path.join(dir, "package.json"), JSON.stringify({ scripts: {} }))
  await writeFile(path.join(dir, "tsconfig.json"), JSON.stringify({
    compilerOptions: { strict: true, jsx: "preserve", types: [], noEmit: true },
    include: ["*.tsx"],
  }))
  const input = path.join(dir, "input.tsx")
  await writeFile(input, "export const value: string = 42")
  const command = await selectCommand(dir)
  assert.equal(command.command, "node")
  assert.notEqual(command.command, process.execPath, "must not execute the OpenCode host binary")
  assert.ok(command.args[0]!.endsWith("node_modules/typescript/bin/tsc"))
  assert.equal((await runCheck(command, options)).kind, "failed")
  await writeFile(input, 'export const value: string = "fixed"')
  assert.equal((await runCheck(command, options)).kind, "passed")
  await writeFile(path.join(dir, "tsconfig.json"), '{"compilerOptions":{"notARealOption":true}}')
  assert.equal((await runCheck(command, options)).kind, "unresolved")
  await writeFile(path.join(dir, "tsconfig.json"), '{"compilerOptions": { "strict": true ')
  assert.equal((await runCheck(command, options)).kind, "unresolved")
})

test("missing config and missing tools are explicit; fallback never installs", async (t) => {
  const dir = await fixture(t)
  await assert.rejects(selectCommand(dir), /no tsconfig.json/)
  await writeFile(path.join(dir, "tsconfig.json"), "{}")
  const command = await selectCommand(dir)
  assert.equal(command.command, "tsc")
  assert.deepEqual(command.args, ["--noEmit"])
  const missing = await runCheck({ ...command, command: path.join(dir, "missing-compiler") }, options)
  assert.equal(missing.kind, "unresolved")
  assert.match(missing.reason!, /ENOENT/)
  await writeFile(path.join(dir, "package.json"), JSON.stringify({ scripts: { typecheck: "nonexistent-typecheck-compiler-fixture" } }))
  const missingScriptTool = await runCheck(await selectCommand(dir), options)
  assert.equal(missingScriptTool.kind, "unresolved")
})

test("combined stdout/stderr cap drains large output and nonzero exit fails", async (t) => {
  const dir = await fixture(t)
  const result = await runCheck(node(dir, `
    process.stdout.write("a".repeat(200000));
    process.stderr.write("b".repeat(200000));
    process.exitCode = 2;
  `), { ...options, maxOutputBytes: 111 })
  assert.equal(result.kind, "failed")
  assert.equal(result.exitCode, 2)
  assert.equal(Buffer.byteLength(result.output), 111)
  const unicode = await runCheck(node(dir, 'process.stdout.write("😀".repeat(100))'), { ...options, maxOutputBytes: 5 })
  assert.equal(unicode.kind, "passed")
  assert.ok(Buffer.byteLength(unicode.output) <= 5)
})

test("manager subprocesses cannot ask Corepack to download or auto-pin tooling", async (t) => {
  const dir = await fixture(t)
  const result = await runCheck(node(dir, `
    console.log(JSON.stringify({
      network: process.env.COREPACK_ENABLE_NETWORK,
      autoPin: process.env.COREPACK_ENABLE_AUTO_PIN,
      latest: process.env.COREPACK_DEFAULT_TO_LATEST,
      path: Boolean(process.env.PATH)
    }));
  `), options)
  assert.equal(result.kind, "passed")
  assert.deepEqual(JSON.parse(result.output), { network: "0", autoPin: "0", latest: "0", path: true })
})

test("timeouts and external abort kill process groups including grandchildren", async (t) => {
  const dir = await fixture(t)
  const pidfile = path.join(dir, "grandchild.pid")
  const source = `
    const {spawn} = require("node:child_process");
    const child = spawn(process.execPath, ["-e", "setInterval(()=>{}, 1000)"], {stdio:"inherit"});
    require("node:fs").writeFileSync(${JSON.stringify(pidfile)}, String(child.pid));
    setInterval(()=>{},1000);
  `
  const result = await runCheck(node(dir, source), { ...options, timeoutMs: 500 })
  assert.equal(result.kind, "unresolved")
  assert.match(result.reason!, /timed out/)
  const pid = Number(await readFile(pidfile, "utf8"))
  // Linux may retain a killed grandchild as a zombie until init reaps it.
  try {
    const status = await readFile(`/proc/${pid}/stat`, "utf8")
    assert.match(status, /^\d+ \(.+\) Z /)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
  }
  const controller = new AbortController()
  const running = runCheck(node(dir, source), { ...options, signal: controller.signal })
  const timer = setTimeout(() => controller.abort(), 500)
  try { await assert.rejects(running, { name: "AbortError" }) } finally { clearTimeout(timer) }
  controller.abort()
  await assert.rejects(runCheck(node(dir, ""), { ...options, signal: controller.signal }), { name: "AbortError" })
})

test("signal termination and parent exit with descendants cannot hang", async (t) => {
  const dir = await fixture(t)
  const result = await runCheck(node(dir, 'process.kill(process.pid, "SIGTERM")'), options)
  assert.equal(result.kind, "unresolved")
  const detachedOutput = await runCheck(node(dir, `
    require("node:child_process").spawn(process.execPath, ["-e", "setInterval(()=>{},1000)"], {stdio:"inherit"});
    process.exit(0);
  `), options)
  assert.equal(detachedOutput.kind, "passed")
})
