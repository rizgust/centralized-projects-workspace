# Security policy

## Minimum rules

- Never expose secrets in task files, reports, messages, decisions or logs.
- Never commit secrets. `.env*` files stay gitignored; reference a variable by name only.
- Do not print credentials into reports or terminal summaries.
- Do not access production unless explicitly authorized for that action.
- Do not perform destructive production operations (data deletion, destructive
  migrations, dropping tables, rotating keys in use) without Owner approval.
- Do not weaken authentication or authorization to simplify implementation.
- Do not disable security controls (RLS, webhook secret checks, host checks, rate limits)
  to make tests pass.
- Record any discovered security concern in the project's `STATUS.md` risks and, if it
  changes the design, in `decisions/`.
- Use least privilege: prefer the user-scoped/RLS client over service-role/admin clients;
  use throwaway test users and clean them up.
- Treat work-project information separately from personal projects. Never copy data,
  credentials or code between projects of different classifications.

## Workspace specifics

- `.mcp.json` at the workspace root may bind MCP servers (e.g. Supabase) to one project. Before
  using any Supabase tool, confirm the ref belongs to the active project; otherwise stop
  and tell the Owner.
- Secret values stored in vendor dashboards (Vercel, Supabase vault, GitHub secrets) are set
  by the Owner. Agents may say which variable is needed, not what its value is.
