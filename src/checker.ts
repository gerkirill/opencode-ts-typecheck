import { spawn } from "node:child_process"
import { access, readFile, realpath, stat } from "node:fs/promises"
import path from "node:path"

export type CheckCommand = { command: string; args: string[]; cwd: string; label: string }
export type CheckResult = {
  kind: "passed" | "failed" | "unresolved"
  output: string
  exitCode: number | null
  reason?: string
}

async function exists(file: string): Promise<boolean> {
  try {
    await access(file)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false
    throw error
  }
}

export async function selectCommand(directory: string): Promise<CheckCommand> {
  const cwd = await realpath(directory)
  if (!(await stat(cwd)).isDirectory()) throw new Error(`Not a directory: ${directory}`)
  let pkg: Record<string, unknown> = {}
  const manifest = path.join(cwd, "package.json")
  if (await exists(manifest)) {
    try {
      const parsed: unknown = JSON.parse(await readFile(manifest, "utf8"))
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("expected an object")
      pkg = parsed as Record<string, unknown>
    } catch (error) {
      throw new Error(`Cannot read package.json in ${cwd}: ${String(error)}`)
    }
  }
  const scripts = pkg.scripts as Record<string, unknown> | undefined
  if (scripts && Object.hasOwn(scripts, "typecheck")) {
    if (typeof scripts.typecheck !== "string" || !scripts.typecheck.trim()) {
      throw new Error(`Invalid scripts.typecheck in ${manifest}: expected a nonempty string`)
    }
    let manager: string
    if (pkg.packageManager !== undefined) {
      const match = typeof pkg.packageManager === "string"
        ? /^(npm|pnpm|yarn|bun)@\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.exec(pkg.packageManager)
        : null
      if (!match) throw new Error(`Invalid or unsupported packageManager in ${manifest}`)
      manager = match[1]!
    } else {
      const managers = new Set<string>()
      for (const [file, tool] of [
        ["npm-shrinkwrap.json", "npm"], ["package-lock.json", "npm"],
        ["pnpm-lock.yaml", "pnpm"], ["yarn.lock", "yarn"],
        ["bun.lock", "bun"], ["bun.lockb", "bun"],
      ] as const) {
        if (await exists(path.join(cwd, file))) managers.add(tool)
      }
      if (managers.size > 1) throw new Error(`Conflicting package manager lockfiles in ${cwd}`)
      manager = [...managers][0] ?? "npm"
    }
    return { command: manager, args: ["run", "typecheck"], cwd, label: `${manager} run typecheck` }
  }
  if (!(await exists(path.join(cwd, "tsconfig.json")))) {
    throw new Error(`Cannot run tsc --noEmit: no tsconfig.json in ${cwd}`)
  }
  let ancestor = cwd
  for (;;) {
    const compiler = path.join(ancestor, "node_modules/typescript/bin/tsc")
    if (await exists(compiler)) {
      // OpenCode can be a standalone binary: process.execPath is not necessarily Node.
      return { command: "node", args: [compiler, "--noEmit"], cwd, label: "tsc --noEmit" }
    }
    const parent = path.dirname(ancestor)
    if (parent === ancestor) break
    ancestor = parent
  }
  return { command: "tsc", args: ["--noEmit"], cwd, label: "tsc --noEmit" }
}

export async function runCheck(
  command: CheckCommand,
  options: { signal?: AbortSignal; timeoutMs: number; maxOutputBytes: number },
): Promise<CheckResult> {
  const { signal, timeoutMs, maxOutputBytes } = options
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error("timeoutMs must be positive and finite")
  if (!Number.isSafeInteger(maxOutputBytes) || maxOutputBytes < 0) throw new Error("maxOutputBytes must be a nonnegative integer")
  if (signal?.aborted) throw new DOMException("Typecheck aborted", "AbortError")
  if (!(await stat(command.cwd)).isDirectory()) throw new Error(`Not a directory: ${command.cwd}`)
  if (signal?.aborted) throw new DOMException("Typecheck aborted", "AbortError")
  return new Promise<CheckResult>((resolve, reject) => {
    const chunks: Buffer[] = []
    let bytes = 0
    let timedOut = false
    let aborted = false
    let spawnError: Error | undefined
    const child = spawn(command.command, command.args, {
      cwd: command.cwd, detached: process.platform !== "win32", stdio: ["ignore", "pipe", "pipe"], shell: false,
      // Corepack shims must fail on a missing manager rather than bootstrap it.
      env: { ...process.env, COREPACK_ENABLE_NETWORK: "0", COREPACK_ENABLE_AUTO_PIN: "0", COREPACK_DEFAULT_TO_LATEST: "0" },
    })
    function kill(): void {
      try {
        if (process.platform !== "win32" && child.pid) process.kill(-child.pid, "SIGKILL")
        else child.kill("SIGKILL")
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ESRCH") child.kill("SIGKILL")
      }
    }
    const timer = setTimeout(() => {
      timedOut = true
      kill()
    }, timeoutMs)
    const abort = () => {
      aborted = true
      kill()
    }
    signal?.addEventListener("abort", abort, { once: true })
    if (signal?.aborted) abort()
    const collect = (data: Buffer) => {
      const kept = data.subarray(0, Math.max(0, maxOutputBytes - bytes))
      if (kept.length) chunks.push(Buffer.from(kept))
      bytes += kept.length
    }
    child.stdout.on("data", collect)
    child.stderr.on("data", collect)
    child.on("error", (error) => {
      spawnError = error
      kill()
    })
    // A script must not leave descendants holding its output pipes open.
    child.on("exit", kill)
    child.on("close", (exitCode, exitSignal) => {
      clearTimeout(timer)
      signal?.removeEventListener("abort", abort)
      if (aborted) {
        reject(new DOMException("Typecheck aborted", "AbortError"))
        return
      }
      // Drop an incomplete trailing UTF-8 sequence rather than growing the byte cap
      // with a replacement character.
      const output = new TextDecoder().decode(Buffer.concat(chunks), { stream: true })
      if (timedOut || spawnError || exitSignal) {
        let reason = `Typecheck terminated by ${exitSignal}`
        if (spawnError) reason = `Cannot run ${command.label}: ${spawnError.message}`
        if (timedOut) reason = `Typecheck timed out after ${timeoutMs}ms`
        resolve({ kind: "unresolved", output, exitCode, reason })
      } else if (exitCode === 0) {
        resolve({ kind: "passed", output, exitCode })
      } else {
        const configurationError = /error TS(?:1800[23]|5\d{3}|6[01]53)\b|tsconfig[^\r\n]*\.json[^\r\n]*error TS|Cannot find module .*typescript|command not found|(?:^|\n)(?:\/bin\/)?(?:ba)?sh:[^\r\n]*not found|not recognized as an internal/i.test(output)
        resolve({ kind: configurationError ? "unresolved" : "failed", output, exitCode, ...(configurationError ? { reason: "Typecheck configuration or tool error" } : {}) })
      }
    })
  })
}
