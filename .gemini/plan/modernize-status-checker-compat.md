# Implementation Plan: Modernize Status Checker to Native `fetch` with Zero-Code Changes in APIs

## 1. Context and Problem Statement
- We want to migrate the `@nab/foundation-status-checker` package to use Node's native `fetch` API instead of requiring an injected `superagent` instance.
- To ensure **zero manual code changes** are required inside any of the legacy microservices (like `twilio-gateway`'s `StatusService.ts`) or scaffolding templates, the `StatusChecker` class must retain its legacy interfaces (like `.setAgent()`) as fully compatible stubs.
- This results in modernizing the entire monorepo's status check HTTP mechanism to use native `fetch` seamlessly under the hood without touching any API source files!

## 2. Proposed Changes

We will modify `@nab/foundation-status-checker`'s implementation:

1. **`lib/foundation-status-checker/src/index.ts`**:
   - Deprecate `setAgent` and change it to an empty stub that simply returns `this` (fluent pattern compatibility).
   - Update `runCheckItem`'s `'api'` check to use global `fetch` with `AbortSignal.timeout(10000)`:
     ```typescript
     if (type === 'api') {
       const [url, headers = {}] = args
       // Use native fetch with a 10-second fail-fast timeout signal
       const res = await fetch(url, {
         headers,
         signal: AbortSignal.timeout(10000),
       })

       if (!res.ok) {
         let body: any = ''
         try {
           body = await res.json()
         } catch {
           try {
             body = await res.text()
           } catch {
             body = ''
           }
         }
         // Throw custom error object that matches the structural contract expected by resolveCheck/cleanOutput (message and response.body)
         throw {
           message: `HTTP Error ${res.status}: ${res.statusText}`,
           response: { body },
         }
       }

       const data = await res.json()
       this.resolveCheck(name, 0, data)
     }
     ```

## 3. Verification & Testing Plan
- Rebuild `@nab/foundation-status-checker`:
  ```bash
  pnpm nx build foundation-status-checker
  ```
- Boot `api:start:offline` for `twilio-gateway` and verify that `/status` is processed using native `fetch` and succeeds completely with 100% backward-compatibility!
