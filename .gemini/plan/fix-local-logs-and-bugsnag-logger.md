# Implementation Plan: Case-Insensitive Pretty Logs & Bugsnag Logger Injection

## 1. Context and Problem Statement
- Local console logs were not being pretty-printed under standard Serverless Offline execution because we were only checking `NAB_SECRET_HANDLER_STRATEGY_LOCAL_MODE === 'yes'`.
- To ensure local logs are always formatted-printed on local terminals, we will expand the `isLocalMode` check in `@nab/foundation-logger` to also match standard local environments (`IS_OFFLINE=true` or `NODE_ENV=development`), with robust case-insensitive comparison.
- Additionally, we want to ensure `@nab/foundation-bugsnag` uses our modern Pino logger instead of the default console fallback when loaded inside the monorepo. Since `@nab/foundation-bugsnag` must have zero direct dependencies on `@nab/foundation-logger`, we will use the **Logger Injection** pattern: we will add a static `.setLogger()` setter on `Bugsnag` and dynamically wire our Pino logger inside `@nab/foundation-compat` at startup.

## 2. Proposed Changes

### Step 1: Expand Local Mode Check in `@nab/foundation-logger`
1. **`lib/foundation-logger/src/index.ts`**:
   - Update `isLocalMode` definition to include `IS_OFFLINE` and `NODE_ENV`:
     ```typescript
     const isLocalMode =
       String(process.env['NAB_SECRET_HANDLER_STRATEGY_LOCAL_MODE']).toLowerCase() === 'yes' ||
       String(process.env['IS_OFFLINE']).toLowerCase() === 'true' ||
       process.env['NODE_ENV'] === 'development'
     ```

### Step 2: Add Logger Injection to `@nab/foundation-bugsnag`
1. **`lib/foundation-bugsnag/src/index.ts`**:
   - Add instance and static `setLogger` methods to `Bugsnag` class:
     ```typescript
     /** Binds a logger instance dynamically at runtime. */
     public setLogger(logger: any): this {
       this.logger = logger
       return this
     }

     /** Binds a logger instance dynamically at runtime. */
     public static setLogger(logger: any): void {
       Bugsnag.Instance.setLogger(logger)
     }
     ```

### Step 3: Inject Logger in `@nab/foundation-compat`
1. **`lib/foundation-compat/src/index.ts`**:
   - Instantiate and register our pino logger into `Bugsnag` at startup:
     ```typescript
     // Decoupled Injection: bind our high-performance logger into Bugsnag at runtime
     try {
       const pinoLogger = createLogger({ name: 'bugsnag' })
       Bugsnag.setLogger(pinoLogger)
     } catch {
       // Silent fallback if Bugsnag is not installed
     }
     ```

## 3. Verification & Testing Plan
- Rebuild all modified packages:
  ```bash
  pnpm nx build foundation-logger && pnpm nx build foundation-bugsnag && pnpm nx build foundation-compat
  ```
- Run unit tests to ensure no regressions:
  ```bash
  pnpm nx test foundation-logger && pnpm nx test foundation-bugsnag && pnpm nx test foundation-compat
  ```
- Boot `api:start:offline` for `twilio-gateway` and verify that logs on the console are beautifully colored and formatted.
