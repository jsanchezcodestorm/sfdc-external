# AGENTS.md

## Scope

These instructions apply to all files under `frontend/`.
Read root [AGENTS.md](/Users/jeanpaul/projects/cs-repository/sfdc-external/AGENTS.md) first for repo-wide invariants.

## Frontend Role

`frontend/` is the React UI for backend-managed data and workflows.

The frontend must:

* talk only to backend endpoints
* use cookie-backed sessions with `credentials: "include"`
* stay focused on presentation and user interaction

The frontend must not:

* call Salesforce directly
* contain backend security logic
* assume access to JWT contents from JavaScript

## Architecture Rules

Primary areas:

```text
src/components  shared presentational pieces
src/features    feature-specific UI and orchestration
src/pages       route-level composition
src/lib         API helpers and shared utilities
src/config      frontend configuration
```

Rules:

* Keep components, hooks, and utilities small, focused, and reusable.
* Prefer composition over large page-level components with embedded business rules.
* Keep route pages thin; move reusable UI and stateful logic into features or shared modules.
* Do not duplicate backend validation, ACL, or visibility policy in the UI as an authority source.
* When API contracts change, update consumers directly instead of adding fallback parsing or silent compatibility branches.

## API Consumption

Use backend endpoints only, typically under `/api/*`.

Example:

```ts
fetch("/api/query", {
  method: "POST",
  credentials: "include",
})
```

Rules:

* Treat backend responses as the contract boundary.
* Handle auth and permission failures explicitly in UI flows.
* Validate assumptions about required response fields when contracts change.
* Do not work around backend contract drift with UI-only shims unless there is an explicit, documented rollout requirement.

## Change Rules

When implementing frontend changes:

1. Confirm the backend contract and route shape.
2. Update shared types or client helpers first if needed.
3. Update feature logic and UI composition.
4. Keep pages and shared components modular.
5. Verify authenticated requests still use cookies correctly.

## Verification

Run the checks that match the scope:

```bash
npm run lint --workspace frontend
npm run build --workspace frontend
```

If the change depends on backend contract updates, verify the end-to-end flow against the updated API behavior.

## Reference Docs

Consult these when the change touches backend-driven behavior:

* `docs/architecture-overview.md`
* `docs/security-model.md`
* `docs/entity-config-guide.md`
* `docs/query-template-guide.md`
