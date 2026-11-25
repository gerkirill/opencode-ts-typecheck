import { Cause, Deferred, Effect, Semaphore } from "effect"
import type { CheckCommand, CheckResult } from "./checker.ts"

export interface Options {
  maxAttempts: number
  timeoutMs: number
  maxOutputBytes: number
}

export function permissionResource(command: Pick<CheckCommand, "command" | "args">): string {
  return [command.command, ...command.args].map((arg) =>
    /^[A-Za-z0-9_./:@%+=,-]+$/.test(arg) ? arg : `'${arg.replaceAll("'", "'\\''")}'`,
  ).join(" ")
}

export function options(input: Readonly<Record<string, unknown>> = {}): Options {
  const bounded = (key: string, fallback: number, max: number) => {
    const value = input[key] ?? fallback
    if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > max)
      throw new Error(`typecheck: ${key} must be an integer between 1 and ${max}`)
    return value
  }
  return {
    maxAttempts: bounded("maxAttempts", 3, 10),
    timeoutMs: bounded("timeoutMs", 60_000, 300_000),
    maxOutputBytes: bounded("maxOutputBytes", 16_384, 65_536),
  }
}

/** All asynchronous boundaries remain Effects: interruption is never converted to a diagnostic. */
export interface IO {
  applicable(directory: string): Effect.Effect<boolean, unknown>
  snapshot(directory: string): Effect.Effect<string, unknown>
  select(directory: string): Effect.Effect<CheckCommand, unknown>
  check(command: CheckCommand, options: Options): Effect.Effect<CheckResult, unknown>
  permission(sessionID: string, agent: string, command: CheckCommand): Effect.Effect<void, unknown>
  repair(sessionID: string, text: string): Effect.Effect<void, unknown>
  /** One terminal status admission, separate from the remediation-request budget. */
  report(sessionID: string, text: string): Effect.Effect<void, unknown>
  clearStatus(sessionID: string): Effect.Effect<void, unknown>
}

interface State {
  applicability: "unprobed" | "applicable" | "skipped"
  baseline?: string
  directory?: string
  agent?: string
  attempts: number
  checks: number
  dirty: boolean
  terminal: boolean
  denied: boolean
  invalidated: Deferred.Deferred<void>
  cached?: { fingerprint: string; result: CheckResult }
  lock: Semaphore.Semaphore
}

export function createGate(io: IO, config: Options = options()) {
  const sessions = new Map<string, State>()
  const directories = new Map<string, Semaphore.Semaphore>()
  const fresh = (): State => ({
    applicability: "unprobed",
    attempts: 0, checks: 0, dirty: false, terminal: false, denied: false,
    invalidated: Deferred.makeUnsafe<void>(),
    lock: Semaphore.makeUnsafe(1),
  })
  const state = (id: string) => {
    let value = sessions.get(id)
    if (!value) sessions.set(id, value = fresh())
    return value
  }
  const current = (id: string, value: State) => sessions.get(id) === value
  const finish = (id: string, value: State, text: string) => Effect.gen(function* () {
    if (!current(id, value) || value.terminal) return
    value.terminal = true
    yield* io.report(id, `Typecheck gate FINAL — UNRESOLVED\n${text}\nDo not claim typecheck success. Remediation requests: ${value.attempts}/${config.maxAttempts}.`)
  })
  const guarded = (id: string, value: State, work: Effect.Effect<void, unknown>) =>
    Effect.raceFirst(work, Deferred.await(value.invalidated)).pipe(Effect.catchCause((cause) =>
      Cause.hasInterrupts(cause) || value.denied ? Effect.failCause(cause) :
        finish(id, value, `Typecheck gate runtime error:\n${Cause.pretty(cause)}`)),
      Effect.orDie)

  return {
    /** Only the SDK's user-prompt hook calls this; synthetic repair input never resets the epoch. */
    prompt(id: string) {
      const previous = sessions.get(id)
      sessions.set(id, fresh())
      if (previous) Deferred.doneUnsafe(previous.invalidated, Effect.void)
    },
    context(id: string, directory: string, agent: string) {
      const value = state(id)
      return guarded(id, value, value.lock.withPermit(Effect.gen(function* () {
        if (!current(id, value) || value.terminal) return
        if (value.directory !== undefined && value.directory !== directory) {
          yield* finish(id, value, "Session directory changed during this request.")
          return
        }
        if (value.applicability === "skipped") return
        value.agent = agent
        if (value.baseline !== undefined) return
        if (value.applicability === "unprobed") {
          const supported = yield* io.applicable(directory)
          if (!current(id, value)) return
          value.directory = directory
          value.applicability = supported ? "applicable" : "skipped"
          if (!supported) return
        }
        const baseline = yield* io.snapshot(directory)
        if (!current(id, value)) return
        value.baseline = baseline
      })))
    },
    idle(id: string, directory: string, background: ReadonlyArray<{ sessionID: string }>) {
      if (background.some((work) => work.sessionID === id)) return Effect.void
      const value = state(id)
      return guarded(id, value, value.lock.withPermit(Effect.gen(function* () {
        if (!current(id, value) || value.terminal) return
        if (value.applicability === "skipped" && value.directory === directory) return
        if (value.baseline === undefined || !value.agent || value.directory !== directory) {
          yield* finish(id, value, "No valid initial model-context snapshot for this session directory.")
          return
        }
        let fingerprint = yield* io.snapshot(directory)
        if (!current(id, value)) return
        if (fingerprint !== value.baseline) value.dirty = true
        if (!value.dirty) return
        while (current(id, value) && !value.terminal) {
          let result = value.cached?.fingerprint === fingerprint ? value.cached.result : undefined
          if (!result) {
            if (value.checks >= config.maxAttempts * 2 + 2) {
              yield* finish(id, value, "Files kept changing during validation; bounded validation budget exhausted.")
              return
            }
            // Selection and approval must refer to the same inputs we execute against.
            // Count restarts too, so files changing during approval cannot spin forever.
            value.checks++
            const selectedFingerprint = fingerprint
            const command = yield* io.select(directory)
            if (!current(id, value)) return
            // Denial must terminate the execution, never become a synthetic repair request.
            yield* io.permission(id, value.agent, command).pipe(Effect.catchCause((cause) => {
              value.denied = true
              value.terminal = true
              return Effect.failCause(cause)
            }), Effect.orDie)
            if (!current(id, value)) return
            let lock = directories.get(directory)
            if (!lock) directories.set(directory, lock = Semaphore.makeUnsafe(1))
            const checked = yield* lock.withPermit(Effect.gen(function* () {
              if (!current(id, value)) return undefined
              const before = yield* io.snapshot(directory)
              if (before !== selectedFingerprint) return { before, after: before, result: undefined }
              const checkedResult = yield* io.check(command, config)
              const after = yield* io.snapshot(directory)
              return { before, after, result: checkedResult }
            }))
            if (!checked || !current(id, value)) return
            fingerprint = checked.after
            if (!checked.result || checked.before !== checked.after) continue
            result = checked.result
            value.cached = { fingerprint, result }
          }
          if (result.kind === "passed") {
            yield* io.clearStatus(id)
            if (!current(id, value)) return
            value.baseline = fingerprint
            value.dirty = false
            value.attempts = 0
            value.checks = 0
            value.cached = undefined
            return
          }
          const detail = `${result.reason ?? result.kind}\n${result.output}`.slice(0, config.maxOutputBytes)
          if (result.kind === "unresolved" || value.attempts >= config.maxAttempts) {
            yield* finish(id, value, detail)
            return
          }
          // Recheck cached failures too: no stale diagnostic may be admitted after a concurrent edit.
          const now = yield* io.snapshot(directory)
          if (!current(id, value)) return
          if (now !== fingerprint) { fingerprint = now; continue }
          value.attempts++
          yield* io.repair(id, `Typecheck failed. Continue working and fix the type errors; do not merely report diagnostics. Then attempt completion again.\nRemediation ${value.attempts}/${config.maxAttempts}.\n${detail}`)
          return
        }
      })))
    },
  }
}
