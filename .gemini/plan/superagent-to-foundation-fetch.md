# Plan: Refactoring Superagent to FoundationFetch Client

**Author:** Gemini CLI (api-architect / Silas)
**Timestamp:** 2025-02-15T12:00:00Z
**Status:** DRAFT (Approved for execution in CI/headless mode)

## 1. Context and Goals
We need to remove our dependency on the external `superagent` library and replace it across the workspace with the native `FoundationFetch`/`foundationFetch` client defined in `@nab/foundation-http` (exposed via `@nab/js-util` / `@nab/foundation-js-util-compat`). 

This plan addresses:
1. Renaming the mock fetch-based client in `@nab/foundation-http` to `FoundationFetch`/`foundationFetch`.
2. Updating the compatibility layer in `@nab/foundation-js-util-compat`.
3. Updating all 4 microservices' `StatusService.ts` files to use the new ES6 named imports of `foundationFetch` and `statusChecker` from `@nab/js-util`.
4. Updating the generator scaffold template `StatusService.ts`.
5. Removing `superagent` dependencies from 4 microservice `package.json` files, the generator template, and the import alignment `microservice-deps.json`.
6. Monorepo verification and compilation check.

---

## 2. Implementation Steps

### Step 1: Rename implementation in `lib/foundation-http/src/index.ts`
Replace the export of `superagentMock` with:
```typescript
/** Standalone fetch client matching superagent main entry methods */
export const FoundationFetch = {
  get(url: string) {
    return new FetchClientRequest(url, 'GET')
  },
  post(url: string) {
    return new FetchClientRequest(url, 'POST')
  },
}

export const foundationFetch = FoundationFetch
```

### Step 2: Update re-exports in `lib/foundation-js-util-compat/src/index.ts`
Update to export `FoundationFetch`, `foundationFetch`, and support backward compatibility:
```typescript
import { statusChecker, StatusChecker } from '@nab/foundation-status-checker'
import { FoundationFetch, foundationFetch } from '@nab/foundation-http'

// Support both direct CommonJS require('superagent') lookups and named ES6 imports!
const compatExports = Object.assign(foundationFetch, {
  statusChecker,
  StatusChecker,
  superagent: foundationFetch,
  FoundationFetch,
  foundationFetch,
})

export = compatExports
```

### Step 3: Update `StatusService.ts` in Microservices
Replace the CommonJS `require('@nab/js-util').statusChecker` and `import * as superagent from 'superagent'` imports with native named ES6 imports:
```typescript
import { statusChecker, foundationFetch } from '@nab/js-util'
```
Update instantiation setup:
```typescript
statusChecker.setAgent(foundationFetch)
```
Target microservices:
- `api/affiliation-api/src/service/StatusService.ts`
- `api/sms-api/src/service/StatusService.ts`
- `api/twilio-gateway/src/service/StatusService.ts`
- `api/stella-connect-metadata-generator-api/src/StatusService.ts`

### Step 4: Update Generator Scaffold
- `tools/generators/api-scaffold/templates/src/service/StatusService.ts`:
Apply the same changes as the other microservices, importing `foundationFetch` from `@nab/js-util` and setting the agent.

### Step 5: Remove Package Dependencies
Delete `"superagent": "catalog:runtime"` from:
1. `api/affiliation-api/package.json`
2. `api/sms-api/package.json`
3. `api/twilio-gateway/package.json`
4. `api/stella-connect-metadata-generator-api/package.json`
5. `tools/generators/api-scaffold/templates/package.json.template`
6. `template/assets/microservice-deps.json`

---

## 3. Verification & Testing Strategy

1. **Install Dependencies**: Execute `pnpm install` at the monorepo root to prune removed dependencies and update lock files.
2. **Compile Check**: Run `pnpm run build` or `nx run-many --target=build` to verify successful compilation across the entire monorepo.
3. **Lint Check**: Run `nx run-many --target=lint` if applicable, or check formatting of modified files.
4. **Git Check**: Verify `git status` output to ensure all files changed match expected scope and are unmodified/unstaged.

---

## 4. Council Assessment (Skeptic, Standards, DX)
- **Malachi (The Skeptic)**: Removing `superagent` reduces external surface area. We must ensure that the fetch-based wrapper `FetchClientRequest` fully handles all chaining calls (e.g., `.set(...)`, `.timeout(...)`) and returns equivalent data shapes (like `.status`, `.body`, `.ok`, `.headers`). The implementation in `lib/foundation-http` looks already robust and tested, and our refactoring leverages this existing mock wrapper.
- **Sterling (Standards & Ethics)**: No third-party dependency additions. Removal of `superagent` adheres to the *Minimalist Stack* law of the Highlander charter.
- **Corvus (DX)**: Transitioning from CommonJS `require` to ES6 named imports from `@nab/js-util` cleans up the codebase and moves the microservices toward standard TypeScript modules.

---

## 5. History / Changelog (Audit Trail)
- **2025-02-15T12:00:00Z**: Silas drafted plan and entered Execution phase in CI environment.
