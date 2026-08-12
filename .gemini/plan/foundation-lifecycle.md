# Implementation Plan: Foundation Lifecycle Make Targets & .npmrc Setup

## Background & Motivation
The user requested standard `make` commands to build, test, and deploy (publish) our foundation packages (`lib/foundation-*`). To support publishing to our internal Verdaccio registry, each foundation package needs a `.npmrc` file using the `api/sms-api/.npmrc` file as a template.

## Scope & Impact
- **New Files**: `.npmrc` added to all 10 `lib/foundation-*` packages.
- **Config Changes**: `Makefile.in` updated to include new targets `build-foundation`, `test-foundation`, and `deploy-foundation`.
- **System Impact**: Enables unified build, test, and registry publishing commands for all shared foundation libraries.

## Implementation Steps

### 1. Distribute `.npmrc` Configuration
Create `.npmrc` in each of the 10 foundation packages with the following exact contents:
```ini
@nab:registry=https://verdaccio.blueclouds.io:4873
registry=https://registry.npmjs.org
ignore-scripts=true
save-exact=true
```
Target directories:
- `lib/foundation-api-auth`
- `lib/foundation-application`
- `lib/foundation-bugsnag`
- `lib/foundation-compat`
- `lib/foundation-db`
- `lib/foundation-http`
- `lib/foundation-js-util-compat`
- `lib/foundation-logger`
- `lib/foundation-secrets`
- `lib/foundation-status-checker`

### 2. Update `Makefile.in`
Add the following dedicated targets to `Makefile.in` under a new section `--- Foundation Package Management ---`:

```makefile
# --- Foundation Package Management ---
build-foundation: ## Build all foundation packages
	$(NX) run-many --target=build --projects="foundation-*" --parallel

test-foundation: ## Test all foundation packages
	$(NX) run-many --target=test --projects="foundation-*" --parallel

deploy-foundation: ## Deploy/Publish all foundation packages to the custom registry
	$(PNPM) --filter "@nab/foundation-*" publish --no-git-checks
```

### 3. Regenerate the Root Makefile
- Run `./configure` to regenerate the root `Makefile` from `Makefile.in`.

## Verification
- Verify that `.npmrc` files are present in all 10 directories.
- Run `make build-foundation` to verify building succeeds.
- Run `make test-foundation` to verify testing succeeds.
- Inspect the output of `make help` to verify new commands are documented and visible.
