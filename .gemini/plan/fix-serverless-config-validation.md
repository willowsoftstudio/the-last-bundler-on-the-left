# Implementation Plan: Fix Serverless Config Validation for Node 22 Runtime

## 1. Context and Problem Statement
- In this monorepo, we are required by `GEMINI.md` to use Node 22 (`nodejs22.x`) under `provider.runtime` inside `serverless.yml` files.
- However, Serverless Framework v3 (`3.40.0`) does not natively support `nodejs22.x` inside its built-in schema validator.
- Because `configValidationMode: error` is set, Serverless Offline immediately crashes during local boot-up with a configuration validation error:
  ```
  Configuration error at 'provider.runtime': must be equal to one of the allowed values...
  ```
- To resolve this and allow all APIs to boot successfully offline while still retaining validation logs, we will change `configValidationMode` from `error` to `warn` inside our `serverless.yml` configurations.

## 2. Proposed Changes

We will update the `configValidationMode` parameter inside `serverless.yml` files:
- `api/twilio-gateway/serverless.yml`
- `api/sms-api/serverless.yml`
- `api/affiliation-api/serverless.yml`
- `api/stella-connect-metadata-generator-api/serverless.yml`
- `tools/generators/api-scaffold/templates/serverless.yml`

#### Format of Changes:
- **`serverless.yml`**:
  - **Old:** `configValidationMode: error`
  - **New:** `configValidationMode: warn`

## 3. Verification & Testing Plan
- Start `api:start:offline` for `twilio-gateway` and verify that the server boots successfully without crashing, and starts listening on ports 3000/3002.
- Make an HTTP GET request to `http://localhost:3000/dev/status` to fetch and report the finalized status checks!
