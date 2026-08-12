# Implementation Plan: Developer Council Expansion

## Background & Motivation
Following a review of external agent skills (like Matt Pocock's repository), we identified gaps in our internal Architecture & Standards Council regarding product translation, domain modeling, context preservation, and assumption interrogation. Instead of directly importing external skills (which poses architectural and tonal risks), we are expanding the Council with two new roles and augmenting an existing one.

## Scope & Impact
- **New Member:** Rowan (Product Owner) - Focuses on ubiquitous language, DDD, and PRD generation.
- **New Member:** Elara (Archivist) - Focuses on Architecture Decision Records (ADRs), wayfinding, and context handoffs.
- **Augmented Member:** Malachi (The Skeptic) - Focuses on Socratic "grilling", challenging assumptions during the planning phase.
- **Updated Hub:** `SKILL.md` roster.

## Implementation Steps

### 1. Augment Malachi (The Skeptic)
- **Edit `team/skeptic.md` & `resources/skeptic.md`**: Add the `grill-me` and `wait-what` philosophies. Instruct Malachi to actively interrogate assumptions and edge cases *before* the Architect finalizes the implementation plan.

### 2. Induct Rowan (The Product Owner)
- **Create `team/product-owner.md`**: Define the agent persona, strictly mapping vague requests into structured domain models.
- **Create `resources/product-owner.md`**: Provide workflows for Domain-Driven Design (DDD), ubiquitous language mapping, and converting feature ideas into structured PRDs/tickets without dictating the database schema.

### 3. Induct Elara (The Archivist)
- **Create `team/archivist.md`**: Define the agent persona responsible for history, context, and decision documentation.
- **Create `resources/archivist.md`**: Provide workflows for creating Architecture Decision Records (ADRs), context preservation (handoff documents), and mapping workspace topology (wayfinding).

### 4. Update the Council Roster
- **Edit `SKILL.md`**: Add Rowan and Elara to the Agent Roster table with their respective file paths, resource guides, and roles. Update Malachi's role to reflect the new pre-planning interrogation mandate.

## Verification
- Verify that the newly created markdown files are formatted correctly and respect the Highlander operational constraints (No Chitchat, High-Signal, etc.).
- Ensure that `SKILL.md` successfully parses the new team members.
