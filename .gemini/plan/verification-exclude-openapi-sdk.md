# Verification Report: Exclude OpenAPI SDKs from pnpm Workspace

## Summary of Changes
Added the recursive exclusion pattern `- '!**/openapi-sdk/**'` to the `packages` list in `pnpm-workspace.yaml`. This ensures that all generated SDK directories and their nested package structures are ignored by the `pnpm` workspace resolver.

## Outcomes & Verification

1. **Successful Installation**:
   - Running `pnpm install` at the root completed successfully in 19.2s.
   - The workspace scope was reduced from 17 projects to 16 projects, confirming that `@nab/affiliation-api-sdk` is no longer treated as a workspace package.
   - No `prepare` scripts were triggered for `openapi-sdk`, successfully bypassing the `TS2527` compiler error.

2. **Exclusion Validation**:
   - Running `pnpm --filter @nab/affiliation-api-sdk build` confirmed that no projects matched the filter:
     ```
     No projects matched the filters in "/var/www/projects/rebel-alliance-api-monorepo"
     ```

## Conclusion
The issue is resolved. The generated OpenAPI SDK is correctly ignored, preventing build/installation failures in the monorepo while keeping other workspace packages working seamlessly.
