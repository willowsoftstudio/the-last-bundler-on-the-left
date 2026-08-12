# Implementation Plan: Override `serverless` to `osls` for Node 22 Support

## 1. Context and Problem Statement
- In this monorepo, we use Node 22 (`nodejs22.x`) for Serverless deployments.
- However, standard Serverless Framework v3 (`3.40.0`) does not natively support Node 22 and throws a configuration validation error inside its schema validator during local boot:
  ```
  Configuration error at 'provider.runtime': must be equal to one of the allowed values...
  ```
- To resolve this, the monorepo has `osls` (Open Serverless v3.59.3, which is a drop-in replacement fork of Serverless Framework v3 that natively supports Node 22) listed in its deployment catalog.
- However, standard plugins (like `serverless-offline` and `serverless-prune-plugin`) pull in standard `serverless@3.40.0` as their peer dependencies, causing the workspace to resolve to the standard unsupported `serverless` instead of `osls`.
- By adding a workspace-wide override mapping `"serverless"` to `"npm:osls@3.59.3"`, we force all local runtimes, peer dependencies, and commands to resolve directly to Open Serverless, cleanly enabling Node 22 support monorepo-wide with **zero code modifications**!

## 2. Proposed Changes

We will update the overrides inside `pnpm-workspace.yaml` and root `package.json`:

1. **`pnpm-workspace.yaml`**:
   - Add `"serverless"` to `overrides`:
     ```yaml
     overrides:
       "@commitlint/load": "20.2.0"
       "@nab/jarvis-base-service": "workspace:@nab/foundation-compat@*"
       "@nab/bugsnag": "workspace:@nab/foundation-bugsnag@*"
       "@nab/js-util": "workspace:@nab/foundation-js-util-compat@*"
       "serverless": "npm:osls@3.59.3"
     ```

2. **`package.json`**:
   - Add `"serverless"` to `pnpm.overrides`:
     ```json
     "pnpm": {
       "overrides": {
         "@commitlint/load": "20.2.0",
         "@nab/jarvis-base-service": "workspace:*",
         "@nab/js-util": "workspace:*",
         "serverless": "npm:osls@3.59.3"
       }
     }
     ```

## 3. Verification & Testing Plan
- Run `pnpm install` to apply the overrides and regenerate the workspace lockfile.
- Boot `api:start:offline` for `twilio-gateway` and verify that the server boots successfully without throwing any configuration validation errors!
