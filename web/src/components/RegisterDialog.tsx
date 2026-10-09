import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { KindInfo, RepoMode } from "../api/types";
import { roleLabel, useLive } from "../store";
import { Dialog, Field } from "./ui";

const KIND_ICON: Record<string, string> = { software: "</>", prototype: "⚙", investigation: "?", design: "✎", general: "▤" };
export const kindIcon = (k: string | undefined) => KIND_ICON[k ?? ""] ?? "◆";

const FALLBACK_KINDS: KindInfo[] = [
  { name: "software", description: "A product codebase.", repo: "clone", roles: ["analyst", "project-manager", "uiux", "frontend", "backend", "infra"], deliverable: "", agentHint: "" },
];

const MODE_TEXT: Record<RepoMode, string> = {
  clone: "Clone an existing remote repository",
  local: "Create a fresh local git repository",
  none: "No repository (notes and files only)",
};

export function RegisterDialog() {
  const { registerOpen, setRegisterOpen, refreshProjects, toast, kinds } = useLive();
  const list = kinds.length ? kinds : FALLBACK_KINDS;
  const empty = { id: "", name: "", type: "", classification: "personal", remote: "", defaultBranch: "main", workingBranch: "" };
  const [f, setF] = useState(empty);
  const [kind, setKind] = useState("software");
  const [mode, setMode] = useState<RepoMode | null>(null); // null = kind default
  const [advanced, setAdvanced] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [idTouched, setIdTouched] = useState(false);

  useEffect(() => {
    if (registerOpen) {
      setF(empty);
      setKind(list[0]?.name ?? "software");
      setMode(null);
      setAdvanced(false);
      setErr(null);
      setIdTouched(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registerOpen]);

  const k = list.find((x) => x.name === kind) ?? list[0];
  const repo: RepoMode = mode ?? k?.repo ?? "clone";
  const set = <K extends keyof typeof f>(key: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [key]: v }));
  const idOk = /^[a-z0-9][a-z0-9-]*$/.test(f.id);
  const valid = idOk && f.name.trim() && (repo !== "clone" || f.remote.trim());

  const submit = async () => {
    if (!valid) return;
    setBusy(true);
    setErr(null);
    try {
      const p = await api.registerProject({
        id: f.id,
        name: f.name.trim(),
        kind,
        repo,
        type: f.type.trim() || kind,
        classification: f.classification,
        remote: repo === "clone" ? f.remote.trim() : "",
        defaultBranch: repo !== "none" ? f.defaultBranch.trim() || undefined : undefined,
        workingBranch: repo === "clone" ? f.workingBranch.trim() || undefined : undefined,
        clone: repo !== "none",
      });
      toast(`Registered ${kind} project ${p.name}`, "success");
      await refreshProjects();
      setRegisterOpen(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={registerOpen}
      onClose={() => setRegisterOpen(false)}
      title="Register project"
      wide
      footer={
        <>
          {err && (
            <p className="form-error" role="alert">
              {err}
            </p>
          )}
          <button className="btn" onClick={() => setRegisterOpen(false)}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={!valid || busy} onClick={submit}>
            {busy ? "Registering…" : "Register"}
          </button>
        </>
      }
    >
      <div className="stack">
        <fieldset className="kind-picker">
          <legend className="field-label">What kind of project is it?</legend>
          <div className="kind-grid">
            {list.map((x) => (
              <label key={x.name} className={`kind-card${kind === x.name ? " on" : ""}`}>
                <input
                  type="radio"
                  name="kind"
                  className="sr-only"
                  checked={kind === x.name}
                  onChange={() => {
                    setKind(x.name);
                    setMode(null);
                  }}
                />
                <span className="kind-icon" aria-hidden="true">
                  {kindIcon(x.name)}
                </span>
                <span className="kind-name">{x.name}</span>
                <span className="kind-desc">{x.description}</span>
                <span className="kind-meta">
                  {x.repo === "clone" ? "git clone" : x.repo === "local" ? "local git" : "no repo"} · {x.roles.map(roleLabel).join(", ")}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="form-grid">
          <Field label="Name">
            <input
              value={f.name}
              onChange={(e) => {
                set("name", e.target.value);
                if (!idTouched) set("id", e.target.value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""));
              }}
              placeholder="My Project"
              autoFocus
            />
          </Field>
          <Field label="ID" hint={f.id && !idOk ? <span className="text-critical">Lowercase letters, digits and dashes only.</span> : "Folder name under projects/."}>
            <input
              value={f.id}
              onChange={(e) => {
                set("id", e.target.value);
                setIdTouched(true);
              }}
              placeholder="my-project"
              aria-invalid={!!f.id && !idOk}
            />
          </Field>
          <Field label="Type label (optional)" hint="Free text, e.g. web-application, game, market study.">
            <input value={f.type} onChange={(e) => set("type", e.target.value)} placeholder={kind} />
          </Field>
          <Field label="Classification">
            <select value={f.classification} onChange={(e) => set("classification", e.target.value)}>
              <option>personal</option>
              <option>work</option>
            </select>
          </Field>

          <div className="span-2 repo-mode">
            <span className="field-label">Repository</span>
            <p className="repo-mode-text">
              <strong>{MODE_TEXT[repo]}</strong>
              {mode && mode !== k?.repo && <span className="badge">overridden</span>}
            </p>
            <label className="check small">
              <input type="checkbox" checked={advanced} onChange={(e) => setAdvanced(e.target.checked)} />
              Advanced: override the repository mode
            </label>
            {advanced && (
              <div className="seg" role="radiogroup" aria-label="Repository mode">
                {(["clone", "local", "none"] as RepoMode[]).map((m) => (
                  <button key={m} type="button" role="radio" aria-checked={repo === m} className={`seg-btn${repo === m ? " on" : ""}`} onClick={() => setMode(m)}>
                    {repo === m && <span aria-hidden="true">✓ </span>}
                    {m}
                  </button>
                ))}
              </div>
            )}
          </div>

          {repo === "clone" && (
            <>
              <Field label="Git remote" span>
                <input value={f.remote} onChange={(e) => set("remote", e.target.value)} placeholder="git@github.com:org/repo.git" aria-required="true" />
              </Field>
              <Field label="Default branch">
                <input value={f.defaultBranch} onChange={(e) => set("defaultBranch", e.target.value)} />
              </Field>
              <Field label="Working branch (optional)">
                <input value={f.workingBranch} onChange={(e) => set("workingBranch", e.target.value)} placeholder="same as default" />
              </Field>
              <p className="muted small span-2">
                The repository is cloned into <code>repos/{f.id || "<id>"}</code> right away.
              </p>
            </>
          )}
          {repo === "local" && (
            <>
              <Field label="Default branch">
                <input value={f.defaultBranch} onChange={(e) => set("defaultBranch", e.target.value)} />
              </Field>
              <p className="info-note span-2">
                A fresh git repo is created in <code>repos/{f.id || "<id>"}</code>. No remote is needed; add one later if the prototype graduates.
              </p>
            </>
          )}
          {repo === "none" && (
            <p className="info-note span-2">
              No repository. Notes, findings and deliverables live in <code>projects/{f.id || "<id>"}/</code>.
            </p>
          )}
        </div>
      </div>
    </Dialog>
  );
}
