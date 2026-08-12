# Design Plan: Serverless Packaging Optimization

## Objective
Optimize the CI/CD pipeline by decoupling the creation of the immutable code artifact (the compiled source and production dependencies) from the generation of environment-specific deployment configurations (CloudFormation templates). This ensures that environment configurations are generated dynamically at deploy-time without needing to rebuild or re-package the code artifact.

## Proposed Strategy

We will leverage Serverless Framework's native `package.artifact` configuration alongside dynamic environment variables.

### 1. `nx.json` Targets Optimization
We will update the `package` and `deploy:packaged` targets to alter their responsibilities:
- **`"package"` Target:** Will run `sls package --package ../../dist/artifacts/{projectName} --verbose` to leverage Serverless's native file pattern zipping logic. Immediately after, it will delete all `.json` files (CloudFormation and state files) from the artifact directory and rename the generated `.zip` to a predictable `code.zip`. This ensures only the pure code artifact is archived.
- **`"deploy:packaged"` Target:** During deployment, we will invoke `sls deploy` directly (not `--package`) but we will prepend it with `SLS_ARTIFACT=../../dist/artifacts/{projectName}/code.zip`. Serverless will detect the `package.artifact` override in the YAML, skip zipping, and immediately generate environment-specific CloudFormation templates using the deploy-time variables, seamlessly uploading the pre-built `code.zip` from its real location relative to `{projectRoot}`. This removes all separate `sls package` compilation directories, and completely eliminates the need to copy files locally, making the deploy step extremely fast and clean.

### 2. `serverless.yml` Updates
We will inject a conditional `artifact:` fallback into the `package:` block of all existing APIs and the API generator template.

```yaml
package:
  artifact: ${env:SLS_ARTIFACT, null}
  patterns:
    - '!./**.tar.gz'
    # ... existing patterns
```

**Why this works beautifully:**
- During the CI build step (`make package-<project>`), Nx creates `code.zip`. The GitHub Action then archives ONLY this `.zip` file into the S3 bucket. No CloudFormation templates are generated or stored in S3.
- During the CI deploy step (`make deploy-packaged-prune-<project>`), the GitHub action extracts `code.zip`. Nx then invokes `sls package` and `sls deploy` with the `SLS_ARTIFACT` environment variable pointing to the `.zip` file. Serverless creates the deployment configurations tailored perfectly for the target environment and region, and skips re-zipping the code.
- During local deployment or testing (`make deploy-prune-<project>`), `SLS_ARTIFACT` is unset, so the fallback is `null`. Serverless gracefully degrades to standard packaging using the defined `patterns`.

## Required Modifications

1. **Modify `nx.json`**:
   - Update `package` options commands.
   - Update `deploy:packaged` options commands.
2. **Modify `serverless.yml` files**:
   - `api/affiliation-api/serverless.yml`
   - `api/sms-api/serverless.yml`
   - `api/stella-connect-metadata-generator-api/serverless.yml`
   - `api/twilio-gateway/serverless.yml`
   - `tools/generators/api-scaffold/templates/serverless.yml`

## Verification Plan
1. Validate `nx.json` syntax after changes.
2. Ensure that no `serverless.yml` syntax errors were introduced.
3. Verify that `which zip` exists in the local environment and works as expected.
4. Execute `make affected-build` and `make affected-package` locally to ensure a `.zip` artifact is correctly created.
5. Provide the user with instructions to run a dry-run local packaging step to confirm the output structure.
