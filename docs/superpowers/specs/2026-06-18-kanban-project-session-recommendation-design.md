# Kanban Project Session Recommendation Design

## Goal

Add a lightweight project grouping flow for tmux-ui.

Project creation should be the place where we recommend related tmux sessions, but not force them.
The first version uses fixed templates.

## Problem

The sidebar now shows many sessions with weak project boundaries.
Users need:

- a way to group sessions by project
- a way to suggest useful role-based sessions for that project
- a way to keep the project itself even if they skip creating sessions

This should support tmux-native collaboration patterns such as:

- `{prefix}-pm` for orchestration
- `{prefix}-review` for review handoff
- `{prefix}-codex` for implementation
- `{prefix}-claude` for analysis
- `{prefix}-scratch` for ad hoc work

## Scope

In scope:

- project creation with fixed recommended session templates
- user choice to create none, some, or all recommended sessions
- saved project grouping even when no sessions are created
- clear mapping from project to recommended session names

Out of scope:

- custom per-project templates
- drag-and-drop task board behavior
- automatic task distribution between sessions
- mandatory session creation

## Proposed Flow

1. User opens Kanban / Project view.
2. User enters project name, path, and optional server.
3. UI shows fixed recommended sessions for that project.
4. User can accept any subset of those sessions.
5. Saving the project always persists the project group.
6. Selected sessions are created only after explicit confirmation.

## Fixed Template

The default template should be:

- `pm`
- `review`
- `codex`
- `claude`
- `scratch`

Each name is prefixed at runtime with the project name:

- `xxvisa-pm`
- `xxvisa-review`
- `xxvisa-codex`
- `xxvisa-claude`
- `xxvisa-scratch`

Recommended initial selection:

- `pm`
- `review`
- `codex`

Optional by default:

- `claude`
- `scratch`

## UI Behavior

The create form should show a recommendation block below the main project fields.

The block should contain:

- the fixed role name
- the derived tmux session name
- a short description of the role
- a checkbox or toggle for whether to create it now

The project can still be saved if no recommended session is selected.

## Data Model

Project persistence keeps the existing project record:

- project name
- path
- optional server
- agent definitions

For the first version, the recommended session template does not need to be persisted per project.
The template is fixed in code.

Session names remain deterministic and project-scoped.

## Backend Behavior

Project creation should:

- validate the project fields
- persist the project entry
- create only the selected sessions
- return the list of created session names

If no recommended sessions are selected:

- persist the project entry
- skip tmux session creation
- return success with an empty created-session list

## Frontend Behavior

The UI should:

- preview the generated session names before creation
- allow toggling each recommended session
- keep the experience simple enough for fast project setup

## Acceptance Criteria

- A project can be saved without creating any sessions.
- The UI shows a fixed recommended session list.
- The user can create only part of the recommended list.
- Session names are derived consistently from the project prefix.
- Existing project/session behavior still works.

## Testing

Add or update tests for:

- project creation without recommended sessions
- project creation with a partial template selection
- project creation with all recommended sessions
- deterministic tmux session name generation

Also update any renderer tests that assert the create form layout.

