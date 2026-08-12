# Implementation Plan: Use `osls` CLI for Local Offline Runs

## 1. Context and Problem Statement
- In this monorepo, we use Node 22 (`nodejs22.x`) for Serverless deployments, but the standard Serverless v3 (`3.40.0`) package does not support this runtime, crashing on boot due to schema validation.
- We cannot change `configValidationMode: error` inside `serverless.yml` files, as they must maintain strict validation rules.
- The monorepo has `osls` (Open Serverless) installed in its dependencies, which is a drop-in fork of Serverless Framework v3 designed to natively support Node 22 (`nodejs22.x`).
- By updating our `"api:start:offline"` target inside `nx.json` to call `osls` instead of `serverless`, we can boot and run our microservices offline on Node 22 seamlessly and with **zero configuration changes** inside `serverless.yml` files!

## 2. Proposed Changes

We will update the offline target inside `nx.json`:

1. **`nx.json`**:
   - **Old Command:**
     ```json
     "command": "set -a && . ./.env && set +a && serverless offline --localEnvironment"
     ```
   - **New Command:**
     ```json
     "command": "set -a && . ./.env && set +a && osls offline --localEnvironment"
     ```

## 3. Verification & Testing Plan
- Start `api:start:offline` for `twilio-gateway` and verify that the server boots successfully without throwing any configuration validation errors!
- Make an HTTP GET request to `http://localhost:3000/dev/status` to fetch and report the finalized status checks!
