# Implementation Plan: Fix `package.json` entrypoints in `@nab/foundation-http`

## 1. Context and Problem Statement
- When starting `twilio-gateway` offline, the execution crashed with:
  ```
  Error: Cannot find module '@nab/foundation-http'
  ```
- This occurs because `lib/foundation-http/package.json` lacks the `"main"` and `"types"` entrypoint properties.
- Since pnpm links the workspace library folder directly, Node defaults to resolving the root `index.js` which is not present, rather than the compiled `dist/index.js` file.
- Adding these fields will fix the module resolution during serverless and local Node runtime execution.

## 2. Proposed Changes

We will update `lib/foundation-http/package.json`:

1. **`lib/foundation-http/package.json`**:
   - **Old Code:**
     ```json
     {
       "name": "@nab/foundation-http",
       "version": "1.0.0",
       "private": true,
       "engines": {
         "node": "22.17.0"
       },
       "dependencies": {
         "express": "catalog:runtime"
       },
       "devDependencies": {
         "@types/express": "catalog:types",
         "@types/node": "catalog:types"
       }
     }
     ```
   - **New Code:**
     ```json
     {
       "name": "@nab/foundation-http",
       "version": "1.0.0",
       "private": true,
       "main": "dist/index.js",
       "types": "dist/index.d.ts",
       "engines": {
         "node": "22.17.0"
       },
       "dependencies": {
         "express": "catalog:runtime"
       },
       "devDependencies": {
         "@types/express": "catalog:types",
         "@types/node": "catalog:types"
       }
     }
     ```

## 3. Verification & Testing Plan
- Rebuild `@nab/foundation-http`:
  ```bash
  pnpm nx build foundation-http
  ```
- Start `api:start:offline` for `twilio-gateway` and verify that the module resolves cleanly and the gateway boots successfully!
