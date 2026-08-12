# Design Plan: Implement Contextual Phase-Based Model Routing in RFC.md

**Date:** 2026-07-27
**Branch:** `feature/deploy`
**Status:** 🟡 Pending Approval

---

## 1. Problem Statement
During a single workspace execution, the task transitions through distinct **phases** (e.g. Planning -> Execution -> Verification). 

To ensure optimal resource allocation, the model selection must not be a static decision. Instead, the local MCP Middleware Server (`mcp-enterprise-guard`) must statefully track the workspace's active phase on **every single tool call** (such as reading a file, writing a diff, or running a shell command/linter), dynamically re-evaluating the target LLM client to match the exact cognitive requirements of that specific phase.

---

## 2. Proposed Changes

We will rewrite and overwrite **`RFC.md`** at the root of the workspace.

### A. Document "Contextual Phase-Based Model Routing" in Section 2.1.2:
Add a dedicated subsection explaining:
*   How the local MCP server statefully tracks the active Workspace Phase (`planning`, `execution`, `verification`).
*   A **Phase-to-Model Transition Matrix** showing how the target LLM dynamically swaps as Skyler coordinates the workspace:
    -   *Planning Phase:* (High-reasoning, complex schema mapping) -> Dynamically routes to **Claude 3.5 Sonnet**.
    -   *Execution Phase:* (Large context edits) -> Dynamically routes to **Claude 3.5 Sonnet / Gemini 1.5 Pro**.
    -   *Verification Phase:* (High-volume log parsing, linter checks) -> Dynamically routes to **Gemini 1.5 Flash**.

### B. Refactor Appendix G `install.sh` & Appendix F `.gemini/model-routing.json`:
*   Update the `.gemini/model-routing.json` configuration schema to support native `"phase_mappings"`.
*   Ensure the universal installer writes all required phase-tracking hooks cleanly into the self-contained installation directory.

---

## 3. Verification Plan
1.  Verify the updated markdown file's readability and syntax.
2.  Deliver a Verification Report to `.gemini/plan/verification-report.md`.
