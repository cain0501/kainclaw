# Task Primer: vscode-extension-gpf4.8 - MCP Phase 6c inbound approval contract

> **Session entry point.** Read this first. Load other docs only if this file explicitly tells you to.

## Task Goal

Define the security and runtime contract required before the stdio MCP server can expose `kainclaw_chat`. The contract must ensure external clients cannot obtain desktop provider credentials, use desktop sessions, or execute model calls without a user-visible, revocable desktop grant.

## Out of Scope

- Do not add `kainclaw_chat` or any provider-backed tool.
- Do not modify the stdio server, desktop session storage, provider adapters, Electron UI, or MCP runtime.
- Do not create a generic localhost HTTP endpoint.

## Resume Context

**Last session date:** 2026-07-24
**Last action taken:** Wrote and reviewed the inbound approval and execution contract, including the correction that the external MCP client, rather than Electron, launches the stdio server.
**Why it was done that way:** Stateful tool execution needs an explicit authority boundary, not an environment variable or tool argument that an external agent can replay.
**Exact next action:** Create and implement Phase 6d's current-user named-pipe bridge, approval surface, and text-only `kainclaw_chat` path.
**Known blockers / watch out:** Stdio has no request headers. The external server process must never receive provider keys or direct desktop storage access.

## Already Completed

- [x] Phase 6a provides a standard stdio MCP entrypoint with static capability data.
- [x] Phase 6b provides process-local, ephemeral inbound sessions.
- [x] Defined the bridge, grant, inbound-context, provider, output, and audit contracts for Phase 6d.

## Next Step

**Do:** Create a Phase 6d implementation primer from the accepted inbound approval contract.
**Files:** New Phase 6d primer only
**Test:** Architecture review before code changes

## Verification

- The contract denies direct provider or desktop-state access from the stdio server.
- Every stateful request is bound to an unexpired grant, tool name, and inbound session ID.
- A user-visible desktop approval and revocation path is specified.
- The contract gives Phase 6d a bounded file and test scope.

## High-Risk Files Touched

- None.

## Definition of Done

- [x] The approval and execution contract is written and internally consistent.
- [x] It preserves process-local inbound session isolation and does not expose provider credentials.
- [x] It defines a bounded Phase 6d implementation slice and verification evidence.
- [x] Beads, current state, and this primer name the exact next step.
