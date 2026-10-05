# Coding quality

## Prefer

- simple implementations
- explicit behavior
- minimal abstraction
- the project's existing conventions (naming, structure, comment density, libraries)
- maintainability and testability
- backward compatibility where required
- reuse of existing infrastructure
- clear error handling

## Avoid

- speculative abstractions
- unnecessary rewrites
- new dependencies without justification (write it in the task notes)
- new services for minor features
- premature distributed systems
- unrelated refactoring during feature work

## Verification

Run the commands in `project.yaml` → `commands` that apply (lint, typecheck, test,
build) and report the actual output. If a command is unavailable in this environment
(e.g. no Godot CLI), say so and describe the manual check that replaces it.

## Documentation

Update repo docs only when they describe the code (README, setup, API docs). Planning,
status and decisions belong in `projects/<id>/`, not in the repo.
