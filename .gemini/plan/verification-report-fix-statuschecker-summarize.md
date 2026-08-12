# Verification Report: Fix StatusChecker Summarize in `@nab/foundation-status-checker`

## 1. Summary of Expectations vs. Outcome
- **Expectation:** Fix `/status` returning `globalStatus: "KO"` and a `500` status code when all checks have successfully passed.
- **Outcome:** Identified that when `failedOnly` was `true` (which is the default behavior when calling `/status` without `showFull=1`), all successful checks (`status === 0`) were filtered out. The `summarize()` method was incorrectly computing the overall `globalStatus` based solely on the items left in this filtered list. Since all checks passed, the filtered list became empty, resulting in a checks count of `0` and `globalStatus` mistakenly defaulting to `'KO'`.
- We successfully fixed this logical bug by computing `globalStatus` from the full, unfiltered list of registered checks first, then safely applying the `failedOnly` filter afterwards.

## 2. Empirical Verification
- **Compilation:**
  - Rebuilt `foundation-status-checker` and `foundation-js-util-compat` perfectly.
- **Unit Testing:**
  - Ran `pnpm nx test foundation-status-checker` and all tests passed perfectly.
- **HTTP Routing Verification:**
  - Booted `api:start:offline` for `sms-api` and called `/status` via `curl`.
  - Calling `curl -i http://localhost:3000/dev/status` now correctly returns an **HTTP 200 OK** status code and **`globalStatus: "OK"`** out-of-the-box:
    ```
    HTTP/1.1 200 OK
    {"status":"success","data":{"checks":{},"view":[],"globalStatus":"OK"},"link":"/status"}
    ```

## 3. Conclusion
The logical status check filtering issue is completely fixed, fully backward-compatible, and fully verified.
