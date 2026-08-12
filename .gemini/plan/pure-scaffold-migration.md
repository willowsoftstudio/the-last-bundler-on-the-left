# Revised Design Plan: Pure Scaffolding & Isolated Compat Layer Migration

## Objective
Fulfill the explicit architectural directive: **Ensure existing/migrating APIs use the compatibility layer, but the scaffold for newly created APIs must strictly use the pure modern foundation layers without any compat references.**

## Key Changes & Clarifications
We will completely decouple `tools/generators/api-scaffold/templates` from `@nab/foundation-compat` and its downstream dependencies (like `@north/shared-source`), shifting the templates to natively consume `@nab/foundation-logger`, `@nab/foundation-db`, `@nab/foundation-secrets`, and `@nab/foundation-application`.

Migrating APIs (via `import-api.sh`) and existing APIs (via `scripts/migrate-to-compat.js`) will remain isolated and correctly process legacy syntax into `@nab/foundation-compat` via our previously implemented `sed` regex steps.

## Implementation Steps

### Phase 1: Pure Modern Scaffolding Templates
1.  **Dependencies (`package.json.template`)**:
    - Remove `@nab/foundation-compat` and `@north/shared-source`.
    - Inject `@nab/foundation-application`, `@nab/foundation-logger`, `@nab/foundation-secrets`, and `@nab/foundation-db` (via `workspace:*`).
2.  **Application Core**:
    - `src/Application.ts`: Change parent inheritance to `@nab/foundation-application`.
    - `src/server-export.ts`: Replace `SecretHandler.boot()` with native `injectSecrets({ strategy: ... })` from `@nab/foundation-secrets`.
    - `src/server.ts`: Replace static `Logger.Instance` lookup with dynamic `createLogger({ name: 'server' })`.
3.  **Data & Logging (Repositories & Services)**:
    - `src/repository/BaseRepository.ts`: Eliminate JBS types. Replace the `db` driver getter with direct calls to `@nab/foundation-db`'s `getConnectionByConfig('statusreports', ...)`. Replace `Logger.Instance` with `createLogger({ name: 'repository' })`.
    - `src/service/StatusService.ts` & `TemplateService.ts` & `BaseService.ts`: Remove JBS `Database` and `SecretHandler`. Directly utilize `getConnectionByConfig` and `getSecret` to resolve DB connections natively.
4.  **Utilities & Routing**:
    - `src/util/helper.ts`: Establish a native `ResponseStatus` enum and `createResponseBody()` helper method so controllers do not rely on the compat layer.
    - `src/controller/BaseController.ts`, `StatusController.ts`, `V1Route.ts`: Update imports to point to `../util/helper.ts` for these common models.
5.  **Test Environment**:
    - `tests/bootenv.ts`: Refactor static `SecretHandler.boot()` to native `injectSecrets({ strategy: 'env' })`.
    - `StatusService.spec.u.ts`: Eradicate all `@nab/foundation-compat` mocks. Stub `@nab/foundation-db`, `@nab/foundation-logger`, and `@nab/foundation-secrets` directly.

### Phase 2: Execution on Existing Workspace APIs
1.  Run the automated `scripts/migrate-to-compat.js` across the four pre-existing microservices in the `api/` directory to formally adopt the `foundation-compat` and `foundation-bugsnag` layer:
    - `affiliation-api`
    - `sms-api`
    - `stella-connect-metadata-generator-api`
    - `twilio-gateway`

## Verification
- **New Scaffolding Verification:** Scaffold a `test-pure-api` using the updated templates. Compile and run its test suite using `nx build` and `nx test` to prove 100% independence from the compat layer.
- **Migration Verification:** Build and test all four migrated existing APIs to guarantee their stability under the compat wrapper.

## Migration & Rollback
- The pure scaffold generation can be reverted by checking out `tools/generators/api-scaffold/templates`.
- The existing API migrations can be undone via standard `git checkout` of the `api/` directory.