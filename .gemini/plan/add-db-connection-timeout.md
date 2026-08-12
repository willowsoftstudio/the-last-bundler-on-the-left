# Implementation Plan: Add Database Connection Timeout in `@nab/foundation-db`

## 1. Context and Problem Statement
- During offline/local development, the database credentials point to a remote development database `dev-dbservice.nab.blueclouds.io` (fetched from Vault).
- Since this remote database is unreachable from local development machines without VPN/tunneling, connection attempts to it hang indefinitely.
- Because `pg-promise` / `pg` connection pools have no connection timeout configured by default, the `/status` route hangs, eventually hitting the 30-second Lambda timeout (`✖ [504] - Lambda timeout`).
- To prevent hanging and allow the application to fail fast with a clean `KO` status report, we should configure a standard 5-second `connectionTimeoutMillis` on the connection pool.

## 2. Proposed Changes

We will update `getDatabaseConnection` in `lib/foundation-db/src/index.ts` to include `connectionTimeoutMillis: 5000`:

1. **`lib/foundation-db/src/index.ts`**:
   - **Old Code:**
     ```typescript
     export function getDatabaseConnection(options: DatabaseConnectionOptions) {
       // Enforce minimal connection pool limits (1 to start, configurable up to max)
       const poolMin = getSafeConfig('db.pool_min', 1)
       const poolMax = getSafeConfig('db.pool_max', 10)

       if (options.connectionString) {
         return pgp({
           connectionString: options.connectionString,
           min: poolMin,
           max: poolMax,
         } as any)
       }

       return pgp({
         host: options.host,
         port: options.port,
         database: options.database,
         user: options.user,
         password: options.password,
         ssl: options.ssl,
         min: poolMin,
         max: poolMax,
       } as any)
     }
     ```
   - **New Code:**
     ```typescript
     export function getDatabaseConnection(options: DatabaseConnectionOptions) {
       // Enforce minimal connection pool limits (1 to start, configurable up to max)
       const poolMin = getSafeConfig('db.pool_min', 1)
       const poolMax = getSafeConfig('db.pool_max', 10)
       const connectionTimeoutMillis = 5000

       if (options.connectionString) {
         return pgp({
           connectionString: options.connectionString,
           min: poolMin,
           max: poolMax,
           connectionTimeoutMillis,
         } as any)
       }

       return pgp({
         host: options.host,
         port: options.port,
         database: options.database,
         user: options.user,
         password: options.password,
         ssl: options.ssl,
         min: poolMin,
         max: poolMax,
         connectionTimeoutMillis,
       } as any)
     }
     ```

## 3. Verification & Testing Plan
- Rebuild the `foundation-db` package:
  ```bash
  pnpm nx build foundation-db
  ```
- Run unit tests on `foundation-db` to ensure they continue to pass:
  ```bash
  pnpm nx test foundation-db
  ```
- Boot `api:start:offline` for `sms-api` and make a GET request to `/status`. The connection to the unreachable remote host should now time out within 5 seconds and return a clean `500` status with `"globalStatus": "KO"` and a descriptive failed check output!
