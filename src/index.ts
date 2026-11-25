import { Agent, Plugin } from "@opencode/plugin/effect"
import { Cause, Deferred, Effect } from "effect"
import { snapshot } from "./changes.ts"
import { runCheck, selectCommand } from "./checker.ts"
import { createGate, options, permissionResource } from "./gate.ts"

type SessionID = Parameters<Plugin.Context["session"]["get"]>[0]["sessionID"]
// Gate IDs originate exclusively from SDK hooks, so preserve their brand at the adapter boundary.
const sessionID = (id: string) => id as SessionID

export default Plugin.define({
  id: "typecheck",
  effect: (ctx) => Effect.gen(function* () {
    const config = options(ctx.options)
    const stopped = yield* Deferred.make<void>()
    yield* Effect.addFinalizer(() => Deferred.succeed(stopped, undefined))
    // Hook registration is scoped, but an already-running callback also needs cancellation on unload.
    const live = (id: SessionID, work: Effect.Effect<void, unknown>) =>
      Effect.raceFirst(work, Deferred.await(stopped)).pipe(
        Effect.catchCause((cause) => Cause.hasInterrupts(cause) ? Effect.failCause(cause) :
          ctx.session.instructions.entry.put({
            sessionID: id, key: "typecheck",
            value: `Typecheck gate FINAL — UNRESOLVED\n${Cause.pretty(cause)}\nDo not claim typecheck success.`,
          }).pipe(Effect.andThen(Effect.failCause(cause)))),
        Effect.orDie,
      )
    const gate = createGate({
      snapshot: (directory) => Effect.tryPromise((signal) => snapshot(directory, signal)),
      select: (directory) => Effect.tryPromise(() => selectCommand(directory)),
      check: (command, config) => Effect.tryPromise((signal) => runCheck(command, { ...config, signal })),
      permission: (id, agent, command) => ctx.permission.assert({
        sessionID: sessionID(id),
        agent: Agent.ID.make(agent),
        action: "shell",
        resources: [permissionResource(command)],
        metadata: { cwd: command.cwd, command: command.command, args: command.args, purpose: "typecheck" },
      }),
      repair: (id, text) => ctx.session.synthetic({
        sessionID: sessionID(id), text, resume: false,
        metadata: { typecheck: true },
        description: "Fix type errors before completing",
      }).pipe(Effect.asVoid),
      report: (id, text) => Effect.gen(function* () {
        const brandedID = sessionID(id)
        yield* ctx.session.instructions.entry.put({ sessionID: brandedID, key: "typecheck", value: text })
        // The gate latches terminal BEFORE this admission. This is a status/report turn,
        // not a fourth remediation request; its completion must not trigger more repair.
        yield* ctx.session.synthetic({
          sessionID: brandedID, resume: false,
          description: "Final unresolved typecheck status",
          metadata: { typecheck: true, terminal: true },
          text: `${text}\nThe gate has stopped automatic remediation. Give an honest final report that typecheck remains unresolved; do not claim it passed. This is a terminal status notice, not another repair request.`,
        })
      }),
      clearStatus: (id) => ctx.session.instructions.entry.remove({
        sessionID: sessionID(id), key: "typecheck",
      }),
    }, config)
    yield* ctx.session.hook("prompt", (event) => live(event.sessionID, Effect.gen(function* () {
      gate.prompt(event.sessionID)
      yield* ctx.session.instructions.entry.remove({ sessionID: event.sessionID, key: "typecheck" })
    })))
    yield* ctx.session.hook("context", (event) => live(event.sessionID, Effect.gen(function* () {
      const session = yield* ctx.session.get({ sessionID: event.sessionID })
      yield* gate.context(event.sessionID, session.location.directory, event.agent)
    })))
    yield* ctx.session.hook("experimental.idle", (event) => live(event.sessionID, Effect.gen(function* () {
      const session = yield* ctx.session.get({ sessionID: event.sessionID })
      yield* gate.idle(event.sessionID, session.location.directory, event.background)
    })))
  }),
})
