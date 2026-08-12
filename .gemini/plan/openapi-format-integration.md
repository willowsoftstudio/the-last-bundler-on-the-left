# Plan: Integrate openapi-format

## 1. Goal

Integrate the `openapi-format` tool into the monorepo to standardize OpenAPI specification formatting. This will involve installing the tool, creating a configuration, and adding `nx` and `make` commands for easy execution.

## 2. Plan

### Phase 1: Setup and Configuration

1.  **Install `openapi-format`**: Add `openapi-format` as a dev dependency to the root `package.json` using `pnpm add -D openapi-format`.
2.  **Create Configuration**:
    *   Create a root configuration file named `openapi-format.yaml`.
    *   Create a directory `openapi-format-config` in the project root.
    *   Inside `openapi-format-config`, create the following empty JSON files: `custom-sort.json`, `custom-casing.json`, and `custom-component-sort.json`.
    *   The `openapi-format.yaml` will contain:
        ```yaml
        sortFile: "./openapi-format-config/custom-sort.json"
        casingFile: "./openapi-format-config/custom-casing.json"
        sortComponentsFile: "./openapi-format-config/custom-component-sort.json"
        no-bundle: true
        ```

### Phase 2: Nx Integration

1.  **Update Existing APIs**:
    *   Identify all `project.json` files within the `api/` directory that correspond to an API with an `openapi/openapi.yml` file.
    *   For each of these `project.json` files, add an `openapi-format` target:
        ```json
        "openapi-format": {
          "executor": "nx:run-commands",
          "options": {
            "command": "openapi-format openapi/openapi.yml -o openapi/openapi.yml",
            "cwd": "{projectRoot}"
          }
        }
        ```
2.  **Update API Scaffolding**:
    *   Add the same `openapi-format` target to the template file `tools/generators/api-scaffold/templates/project.template.json` to ensure new APIs include this command.

### Phase 3: Makefile Integration

1.  **Edit `Makefile.in`**:
    *   Add a `openapi-format-%` target to format a single API's OpenAPI spec:
        ```makefile
        .PHONY: openapi-format-%
        openapi-format-%:
        	@echo "Formatting OpenAPI spec for api '$*'..."
        	nx openapi-format $*
        ```
    *   Add a `format-all` target to format all API OpenAPI specs. This will be an alias for a more specific target.
        ```makefile
        format-all: format-openapi

        .PHONY: format-openapi
        format-openapi:
        	@echo "Formatting all OpenAPI specs..."
        	@PROJECTS=$$(ls -d api/*/ | sed 's/api\///' | sed 's/\///' | tr '
' ' ' | sed 's/ $$//'); 
        	nx run-many --target=openapi-format --projects=$$PROJECTS
        ```

## 3. Verification

After implementation, I will verify the changes by:
1.  Running `make format-all` and ensuring it completes successfully.
2.  Checking the git status to see that the `openapi.yml` files have been formatted.
3.  Running `make openapi-format-affiliation-api` to test the single-API target.
