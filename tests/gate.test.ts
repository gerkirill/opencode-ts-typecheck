import assert from "node:assert/strict"
import test from "node:test"
import { Deferred, Effect, Exit, Fiber, Scope } from "effect"
import type { Plugin } from "@opencode/plugin/effect"
import plugin from "../src/index.ts"
import { createGate, options, permissionResource, type IO } from "../src/gate.ts"
import type { CheckResult } from "../src/checker.ts"

const failed: CheckResult = { kind: "failed", output: "TS2322: wrong type", exitCode: 2 }
const passed: CheckResult = { kind: "passed", output: "", exitCode: 0 }
const run = <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromise(effect)

function fixture(overrides: Partial<IO> = {}) {
  const f = {
    fingerprint: "initial dirty tree",
    checks: 0,
    permissions: 0,
    repairs: [] as string[],
    reports: [] as string[],
    result: failed,
  }
  const io: IO = {
    snapshot: () => Effect.sync(() => f.fingerprint),
    select: (cwd) => Effect.succeed({ command: "npm", args: ["run", "typecheck"], cwd, label: "npm run typecheck" }),
    check: () => Effect.sync(() => { f.checks++; return f.result }),
    permission: () => Effect.sync(() => { f.permissions++ }),
    repair: (id, text) => Effect.sync(() => { f.repairs.push(`${id}: ${text}`) }),
    report: (id, text) => Effect.sync(() => { f.reports.push(`${id}: ${text}`) }),
    clearStatus: () => Effect.void,
    ...overrides,
  }
  const gate = createGate(io)
  const context = (id = "parent") => run(gate.context(id, "/repo", "actual-agent"))
  const idle = (id = "parent", background: { sessionID: string }[] = []) => run(gate.idle(id, "/repo", background))
  return { f, gate, context, idle }
}

test("initial baseline survives multiple model steps and ignores preexisting edits", async () => {
  const { f, context, idle } = fixture()
  await context()
  await idle()
  assert.equal(f.checks, 0)
  f.fingerprint = "agent edit"
  await context()
  await idle()
  assert.equal(f.checks, 1)
  assert.match(f.repairs[0]!, /Continue working and fix/)
})

test("unchanged failure is retained; three synthetic admissions then visible terminal report", async () => {
  const { f, context, idle } = fixture()
  await context()
  f.fingerprint = "bad"
  for (let i = 0; i < 7; i++) { await context(); await idle() }
  assert.equal(f.checks, 1)
  assert.equal(f.repairs.length, 3)
  assert.equal(f.reports.length, 1)
  assert.match(f.reports[0]!, /FINAL — UNRESOLVED/)
})

test("changed fingerprints do not replenish remediation budget; new user prompt does", async () => {
  const { f, gate, context, idle } = fixture()
  await context()
  for (let i = 0; i < 4; i++) { f.fingerprint = `edit ${i}`; await idle() }
  assert.equal(f.repairs.length, 3)
  assert.equal(f.checks, 4)
  assert.equal(f.reports.length, 1)
  gate.prompt("parent")
  await context()
  f.fingerprint = "next task"
  await idle()
  assert.equal(f.repairs.length, 4)
})

test("a successful repair after the final admission can still pass", async () => {
  const { f, context, idle } = fixture()
  await context()
  f.fingerprint = "bad"
  for (let i = 0; i < 3; i++) await idle()
  f.fingerprint = "fixed"
  f.result = passed
  await idle()
  assert.equal(f.checks, 2)
  assert.equal(f.reports.length, 0)
})

test("verified success resets the baseline and grants the next failure episode its full budget", async () => {
  let clears = 0
  const { f, context, idle } = fixture({
    clearStatus: () => Effect.sync(() => { clears++ }),
  })
  await context()
  f.fingerprint = "first failure"
  for (let i = 0; i < 3; i++) await idle()
  f.fingerprint = "fixed"
  f.result = passed
  await idle()
  assert.equal(clears, 1)
  await idle()
  assert.equal(f.checks, 2)
  f.fingerprint = "second failure"
  f.result = failed
  for (let i = 0; i < 4; i++) await idle()
  assert.equal(f.repairs.length, 6)
  assert.equal(f.reports.length, 1)
  assert.match(f.reports[0]!, /Remediation requests: 3\/3/)
})

test("stale successful checks revalidate and cannot spin without bound", async () => {
  let revision = 0
  const { f, context, idle } = fixture({
    snapshot: () => Effect.sync(() => String(revision)),
    check: () => Effect.sync(() => { revision++; return passed }),
  })
  await context()
  revision++
  await idle()
  assert.equal(revision, 9) // dirty edit + eight bounded checks
  assert.equal(f.repairs.length, 0)
  assert.match(f.reports[0]!, /kept changing/)
})

test("command selection is invalidated by manifest edits during permission approval", async () => {
  let revision = "initial"
  const selected: string[] = []
  const approved: string[] = []
  const executed: string[] = []
  const { f, context, idle } = fixture({
    snapshot: () => Effect.sync(() => revision),
    select: (cwd) => Effect.sync(() => {
      const command = revision === "script added" ? "npm" : "tsc"
      selected.push(command)
      return { command, args: [], cwd, label: command }
    }),
    permission: (_id, _agent, command) => Effect.sync(() => {
      approved.push(command.command)
      revision = "script added"
    }),
    check: (command) => Effect.sync(() => {
      executed.push(command.command)
      return command.command === "npm" ? failed : passed
    }),
  })
  await context()
  revision = "source changed"
  await idle()
  assert.deepEqual(selected, ["tsc", "npm"])
  assert.deepEqual(approved, ["tsc", "npm"])
  assert.deepEqual(executed, ["npm"])
  assert.equal(f.repairs.length, 1)
})

test("approval-time edits exhaust the validation budget without running stale commands", async () => {
  let revision = 0
  const { f, context, idle } = fixture({
    snapshot: () => Effect.sync(() => String(revision)),
    permission: () => Effect.sync(() => { revision++ }),
  })
  await context()
  revision++
  await idle()
  assert.equal(revision, 9)
  assert.equal(f.checks, 0)
  assert.equal(f.repairs.length, 0)
  assert.match(f.reports[0]!, /validation budget exhausted/)
})

test("own background work defers; descendant background does not; child sessions gate independently", async () => {
  const { f, context, idle } = fixture()
  await context()
  await context("child")
  f.fingerprint = "bad"
  await idle("parent", [{ sessionID: "parent" }])
  assert.equal(f.checks, 0)
  await idle("parent", [{ sessionID: "child" }])
  await idle("child")
  assert.equal(f.checks, 2)
  assert.match(f.repairs[0]!, /^parent:/)
  assert.match(f.repairs[1]!, /^child:/)
})

test("unresolved infrastructure and runtime exceptions are visible, never repair prompts", async () => {
  for (const check of [
    Effect.succeed({ kind: "unresolved", output: "", exitCode: null, reason: "timeout" } as CheckResult),
    Effect.fail(new Error("missing compiler")),
  ]) {
    const { f, context, idle } = fixture({ check: () => check })
    await context()
    f.fingerprint = "bad"
    await idle()
    assert.equal(f.repairs.length, 0)
    assert.equal(f.reports.length, 1)
    assert.match(f.reports[0]!, /UNRESOLVED/)
  }
})

test("permission denial propagates without checks or synthetic input", async () => {
  const { f, context, idle } = fixture({ permission: () => Effect.fail(new Error("denied")) })
  await context()
  f.fingerprint = "bad"
  await assert.rejects(idle(), /denied/)
  assert.equal(f.checks, 0)
  assert.equal(f.repairs.length, 0)
})

test("new user prompt invalidates and interrupts an in-flight check", async () => {
  const entered = Deferred.makeUnsafe<void>()
  let aborted = false
  const { f, gate, context, idle } = fixture({
    check: () => Deferred.succeed(entered, undefined).pipe(
      Effect.andThen(Effect.never),
      Effect.onInterrupt(() => Effect.sync(() => { aborted = true })),
    ),
  })
  await context()
  f.fingerprint = "bad"
  const pending = idle()
  await run(Deferred.await(entered))
  gate.prompt("parent")
  await pending
  assert.equal(aborted, true)
  assert.equal(f.repairs.length, 0)
  assert.equal(f.reports.length, 0)
})

test("interruption while awaiting permission never launches a check or late repair", async () => {
  const entered = Deferred.makeUnsafe<void>()
  const { f, gate, context } = fixture({
    permission: () => Deferred.succeed(entered, undefined).pipe(Effect.andThen(Effect.never)),
  })
  await context()
  f.fingerprint = "bad"
  await run(Effect.gen(function* () {
    const fiber = yield* Effect.forkChild(gate.idle("parent", "/repo", []))
    yield* Deferred.await(entered)
    yield* Fiber.interrupt(fiber)
  }))
  assert.equal(f.checks, 0)
  assert.equal(f.repairs.length, 0)
  assert.equal(f.reports.length, 0)
})

test("directory lock serializes sessions and interruption removes a queued check", async () => {
  const entered = Deferred.makeUnsafe<void>()
  const queuedPermission = Deferred.makeUnsafe<void>()
  let executions = 0
  const { f, gate, context } = fixture({
    permission: (id) => id === "child" ? Deferred.succeed(queuedPermission, undefined).pipe(Effect.asVoid) : Effect.void,
    check: () => Effect.sync(() => { executions++ }).pipe(
      Effect.andThen(Deferred.succeed(entered, undefined)),
      Effect.andThen(Effect.never),
    ),
  })
  await context()
  await context("child")
  f.fingerprint = "bad"
  await run(Effect.gen(function* () {
    const parent = yield* Effect.forkChild(gate.idle("parent", "/repo", []))
    yield* Deferred.await(entered)
    const child = yield* Effect.forkChild(gate.idle("child", "/repo", []))
    yield* Deferred.await(queuedPermission)
    yield* Effect.yieldNow
    yield* Fiber.interrupt(child)
    yield* Fiber.interrupt(parent)
  }))
  assert.equal(executions, 1)
  assert.equal(f.repairs.length, 0)
})

test("manifest edits while waiting for a directory lock require command reselection", async () => {
  const entered = Deferred.makeUnsafe<void>()
  const childApproved = Deferred.makeUnsafe<void>()
  const release = Deferred.makeUnsafe<void>()
  let revision = "initial"
  const executed: string[] = []
  const { f, gate, context } = fixture({
    snapshot: () => Effect.sync(() => revision),
    select: (cwd) => Effect.sync(() => {
      const command = revision === "new script" ? "npm" : "tsc"
      return { command, args: [], cwd, label: command }
    }),
    permission: (id) => id === "child"
      ? Deferred.succeed(childApproved, undefined).pipe(Effect.asVoid)
      : Effect.void,
    check: (command) => Effect.gen(function* () {
      executed.push(command.command)
      if (executed.length === 1) {
        yield* Deferred.succeed(entered, undefined)
        yield* Deferred.await(release)
        return passed
      }
      return failed
    }),
  })
  await context()
  await context("child")
  revision = "source changed"
  await run(Effect.gen(function* () {
    const parent = yield* Effect.forkChild(gate.idle("parent", "/repo", []))
    yield* Deferred.await(entered)
    const child = yield* Effect.forkChild(gate.idle("child", "/repo", []))
    yield* Deferred.await(childApproved)
    yield* Effect.yieldNow
    revision = "new script"
    yield* Deferred.succeed(release, undefined)
    yield* Fiber.join(parent)
    yield* Fiber.join(child)
  }))
  assert.deepEqual(executed, ["tsc", "npm", "npm"])
  assert.equal(f.repairs.length, 2)
})

test("protocol harness: both resume policies re-enter idle; admission budget is independent", async () => {
  // This models the documented admission contract, not the host's actual scheduler.
  for (const resume of [false, true]) {
    let queued = false
    let completions = 0
    let terminalAdmissions = 0
    let remediationAdmissions = 0
    const { f, context, idle } = fixture({
      repair: () => Effect.sync(() => { queued = true; remediationAdmissions++ }),
      report: () => Effect.sync(() => { queued = true; terminalAdmissions++ }),
    })
    await context()
    f.fingerprint = "bad"
    do {
      queued = false
      completions++
      await idle()
      // resume:true may also request a wake; both consume admitted input in this execution.
      void resume
    } while (queued)
    assert.equal(completions, 5) // initial completion + three repairs + terminal status
    assert.equal(remediationAdmissions, 3)
    assert.equal(terminalAdmissions, 1)
  }
})

test("options are bounded and plugin uses Effect SDK registration", () => {
  assert.equal(plugin.id, "opencode-ts-typecheck")
  assert.equal(typeof plugin.effect, "function")
  assert.throws(() => options({ maxAttempts: 0 }), /maxAttempts/)
  assert.throws(() => options({ timeoutMs: Infinity }), /timeoutMs/)
})

test("permission resources match ordinary shell rules and quote unsafe tokens", () => {
  assert.equal(permissionResource({ command: "npm", args: ["run", "typecheck"] }), "npm run typecheck")
  assert.equal(permissionResource({ command: "tsc", args: ["--noEmit"] }), "tsc --noEmit")
  assert.equal(permissionResource({ command: "/project with spaces/tsc", args: ["x'y", "; touch /tmp/no"] }),
    "'/project with spaces/tsc' 'x'\\''y' '; touch /tmp/no'")
})

test("SDK registers all three scoped Effect hooks; unload cancels an executing hook", async () => {
  const hooks = new Map<string, (event: never) => Effect.Effect<void>>()
  const entered = Deferred.makeUnsafe<void>()
  let interrupted = false
  const ctx = {
    options: {},
    session: {
      hook: (name: string, callback: (event: never) => Effect.Effect<void>) => Effect.sync(() => {
        hooks.set(name, callback)
        return { dispose: Effect.void }
      }),
      get: () => Deferred.succeed(entered, undefined).pipe(
        Effect.andThen(Effect.never),
        Effect.onInterrupt(() => Effect.sync(() => { interrupted = true })),
      ),
      instructions: { entry: { put: () => Effect.void } },
    },
  } as unknown as Plugin.Context
  // Use a real SDK Plugin and Effect scope, with only the transport-facing domain stubbed.
  await run(Effect.gen(function* () {
    const scope = yield* Scope.make()
    yield* plugin.effect(ctx).pipe(Effect.provideService(Scope.Scope, scope))
    assert.deepEqual([...hooks.keys()], ["prompt", "context", "experimental.idle"])
    const fiber = yield* Effect.forkChild(hooks.get("context")!({
      sessionID: "session", agent: "agent",
    } as never))
    yield* Deferred.await(entered)
    yield* Scope.close(scope, Exit.void)
    yield* Fiber.join(fiber)
  }))
  assert.equal(interrupted, true)
})
