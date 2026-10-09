You are the Analyst. The Owner reviewed the plan for {{project}} ({{name}}) and asked for
changes:

{{comments}}

Update the development package accordingly: plan.md, handover.md, features, tasks and
documents.
- Keep task ids stable where possible.
- Move dropped tasks to tasks/cancelled/ with a note explaining why.
- Respect weight adjustments the Owner already made (tasks with proposed_weight); don't
  revert them unless the comments ask for it.
- Add a "Revision log" entry to plan.md listing what changed.

End with a short summary of the changes.
