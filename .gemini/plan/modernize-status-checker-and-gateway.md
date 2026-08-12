# Implementation Plan: Modernize Status Checker & Twilio Gateway Status Service

## 1. Context and Problem Statement
- Currently, the `@nab/foundation-status-checker` uses an injected `superagent` instance to make outgoing HTTP API status checks. This requires every microservice using it to import `superagent` and call `.setAgent(superagent)` during bootstrap, adding unnecessary boilerplate and dependency overhead.
- In Node.js 18+, global `fetch` is native, standard, and highly optimized. By migrating `@nab/foundation-status-checker` to use native `fetch` internally, we can make it completely zero-dependency and self-contained out-of-the-box.
- Inside `twilio-gateway`'s `StatusService.ts`, the checks rely on the legacy `Api.Instance.getConfig('sms')` lookups. We can modernize this service by removing both the `superagent` dependency and the legacy `Api` client lookups, resolving necessary secrets directly and explicitly via `getSecret`.

## 2. Proposed Changes

### Step 1: Migrate `@nab/foundation-status-checker` to Native `fetch`
1. **`lib/foundation-status-checker/src/index.ts`**:
   - Keep `setAgent` as an empty, deprecated stub for backward compatibility.
   - Update `runCheckItem`'s `'api'` check to use the global `fetch` with `AbortSignal.timeout(10000)`:
     ```typescript
     if (type === 'api') {
       const [url, headers = {}] = args
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
         throw {
           message: `HTTP Error ${res.status}: ${res.statusText}`,
           response: { body },
         }
       }

       const data = await res.json()
       this.resolveCheck(name, 0, data)
     }
     ```

### Step 2: Modernize `twilio-gateway`'s `StatusService.ts`
1. **`api/twilio-gateway/src/service/StatusService.ts`**:
   - Remove `import * as superagent from 'superagent'`.
   - Remove `statusChecker.setAgent(superagent)`.
   - Import `getSecret` from `@nab/jarvis-base-service` instead of `Api`.
   - Update `getSmsApiStatus` and `getBankAccountVerificationApiStatus` to fetch `API_<NAME>_URL` and `API_<NAME>_JWT` directly via `getSecret`.
   - **New Code:**
     ```typescript
     /* istanbul ignore file */
     import { BaseService } from './BaseService'
     import { Logger, getSecret } from '@nab/jarvis-base-service'
     const logger = Logger.Instance.get()

     const statusChecker = require('@nab/js-util').statusChecker

     statusChecker.setLogger(logger)

     export class StatusService extends BaseService {

       public async getSmsApiStatus (): Promise<any> {
         try {
           const url = getSecret('API_SMS_URL')
           const jwt = getSecret('API_SMS_JWT')

           statusChecker.addCheck(
             'Twilio Gateway → SMS Api Service',
             'Twilio Gateway connection to SMS Api Service',
             'api',
             url + '/status',
             {
               'Authorization': 'Bearer ' + jwt,
             },
           )
         } catch (e) {
           logger.warn(`Add api check failed: ${(e as Error).message}`)

           return false
         }

         return true
       }

       public async getBankAccountVerificationApiStatus (): Promise<any> {
         try {
           const url = getSecret('API_BANK_ACCOUNT_VERIFICATION_URL')
           const jwt = getSecret('API_BANK_ACCOUNT_VERIFICATION_JWT')

           statusChecker.addCheck(
             'Twilio Gateway → Bank Account Verification Broker Service',
             'Twilio Gateway connection to Bank Account Verification Broker Service',
             'api',
             url + '/status',
             {
               'Authorization': 'Bearer ' + jwt,
             },
           )
         } catch (e) {
           logger.warn(`Add api check failed: ${(e as Error).message}`)

           return false
         }

         return true
       }

       public async getFinalStatus (failedOnly: boolean): Promise<any> {
         let smsApiCheck
         let bankVerificationApiCheck
         let statusCode
         try {
           [smsApiCheck, bankVerificationApiCheck] = await Promise.all([this.getSmsApiStatus(), this.getBankAccountVerificationApiStatus()])
           if (smsApiCheck && bankVerificationApiCheck) {
             statusCode = statusChecker.run(failedOnly)
           } else {
             return {
               globalStatus: 'KO',
               message: 'Problem encountered while adding api/db status checks',
             }
           }
         } catch (e) {
           logger.warn(
             `Problem encountered while running status checks: ${(e as Error).message}`,
           )

           return { globalStatus: 'KO' }
         }

         return statusCode
       }
     }
     ```

## 3. Verification & Testing Plan
- Rebuild `@nab/foundation-status-checker`:
  ```bash
  pnpm nx build foundation-status-checker
  ```
- Build `twilio-gateway` to ensure it compiles flawlessly:
  ```bash
  pnpm nx build twilio-gateway
  ```
- Boot `api:start:offline` for `twilio-gateway` and verify that calling `/status` executes the native `fetch` requests and resolves correctly!
