---
description: "React SPA / TanStack Router — feature boundaries, thin routes, and navigation"
applyTo: "apps/web/src/**,**/vite.config.*,**/e2e/**,**/playwright.config.*"
---

# React SPA — feature routing

Follow [common coding](common-coding.instructions.md). Browser routes live in `apps/web/src/routes/`; Hono feature routes are a different layer under [backend coding](backend-coding.instructions.md).

## Layout and public boundaries

- Use TanStack Router file-based routing in `apps/web/src/routes/`. Route files stay thin: `beforeLoad`, `loader`, and placement / composition of feature components. Do not build feature UI or business logic inside route files.
- Put browser features in `apps/web/src/features/<feature>/{api,components,hooks,lib,index.ts}`. Match the API / shared feature name for the same domain concept.
- A feature's `index.ts` explicitly exports its public components, hooks, and types. External consumers import through that entry; internal files use direct local imports to avoid public-entry cycles.
- Features must not directly import other features, including their public entries. Compose collaboration in routes / an explicit composition boundary and pass inputs or callbacks in.
- Shared presentational primitives belong in `components/ui/`, reusable technical code in `lib/`, and technical hooks in `hooks/`. Do not move domain logic into a shared folder merely to bypass a feature boundary.
- Keep generated route trees generated; regenerate rather than hand-editing them.

## Navigation and loading

- Validate path / search input before use. Keep shareable filters, sorting, pagination, and selected resources in typed URL state; keep transient dialogs / drafts local.
- Reuse TanStack Query query options for route loaders / preloading and mounted feature hooks. The route imports a feature's public query interface instead of reaching into its `api/` implementation.
- Declare pending, empty, error, and not-found behavior. Distinguish inaccessible resources from unhandled transport failures according to the public contract.
- `beforeLoad` auth guards improve navigation only; every protected API operation still authorizes server-side. Avoid redirect loops and validate return destinations to prevent open redirects.
- Components receive data through props and notify parents through callbacks. Keep query / route orchestration separate from presentation.
- Render this SPA in the browser; do not introduce RSC boundaries, `use server`, or Server Actions.

## Shared appearance / scenario locator contract

This contract applies to both the appearance writer under `apps/web/src/` and the scenario writer under `e2e/`; both addresses are in this leaf's delivery metadata.
Derive the interface independently from the glossary and fixed contract, without inspecting the other implementation.

| Preference | Appearance emits | Scenario uses |
| --- | --- | --- |
| First | Semantic control role and accessible name / label using the exact glossary term | `getByRole(role, { name })` or `getByLabel(text)` |
| When semantic wording is ambiguous | Trigger: `data-testid="operation"`; input: `data-testid="operation.field"`, using the contract operation and request-field names | `getByTestId` with the same derived identifier |

Never derive locators from CSS, XPath, positional `nth()`, or incidental screen copy. If appearance disagrees with this contract, change appearance rather than teaching the scenario its implementation.
Scenario execution and annotations belong to [system testing](system-testing.instructions.md).

Deep links and refresh depend on [Static Assets routing](platform-routing.instructions.md); remote state belongs to [data flow](frontend-dataflow.instructions.md).
