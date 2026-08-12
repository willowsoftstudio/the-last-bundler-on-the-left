# Design Plan: Foundation Graceful Degradation & Peer Dependencies

## Objective
Convert `dependencies` on other foundation packages into hybrid `peerDependencies` + `devDependencies` and use **soft dynamic imports** (graceful degradation) in `@nab/foundation-status-checker`. This ensures external consumers can install our foundation packages without npm dependency duplication or runtime crashes if a peer dependency is omitted.

## Key Files & Context
- **Package Config:** `lib/foundation-status-checker/package.json`
- **Source Code:** `lib/foundation-status-checker/src/index.ts`

## Implementation Steps

### Phase 1: Package Configuration Updates
1.  **Refactor Dependencies (`lib/foundation-status-checker/package.json`)**:
    - Move `"@nab/foundation-logger"` from `dependencies` to `devDependencies` mapped to `"workspace:*"`.
    - Add `"@nab/foundation-logger"` to `peerDependencies` with a valid semantic version like `"*"` or `"^1.0.0"`.
    - Set `"peerDependenciesMeta"` to mark the logger as `"optional": true`. This explicitly instructs npm/yarn that this peer dependency is safe to omit.

### Phase 2: Soft Import Refactoring
1.  **Source Code (`lib/foundation-status-checker/src/index.ts`)**:
    - Remove the static `import { createLogger } from '@nab/foundation-logger'` which forces a load-time module resolution.
    - Implement a safe, dynamic `require` block wrapped in a `try/catch`.
    - Add a safe logger factory (native `console` wrapper) as the fallback if `@nab/foundation-logger` fails to load.
    - Update `StatusChecker` to instantiate using this safe factory instead of hardcoded `createLogger`.

## Verification & Testing
1. **Workspace Compilation**: Run `nx build foundation-status-checker` to ensure TypeScript compilation remains perfectly intact without static imports.
2. **Pure API Test**: Run `nx test test-pure-api` to ensure that when the logger IS available (as it is within the workspace), the status checker runs properly and uses the workspace-resolved logger.