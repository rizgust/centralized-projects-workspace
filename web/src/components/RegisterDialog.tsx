import { useEffect, useState } from "react";
import { api } from "../api/client";
import { useLive } from "../store";
import { Dialog, Field } from "./ui";

const TYPES = ["web-application", "backend-service", "game", "template", "library", "cli", "mobile-app", "other"];

export function RegisterDialog() {
  const { registerOpen, setRegisterOpen, refreshProjects, toast } = useLive();
  const [f, setF] = useState({ id: "", name: "", type: "web-application", classification: "personal", remote: "", defaultBranch: "main", workingBranch: "", clone: true });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [idTouched, setIdTouched] = useState(false);

  useEffect(() => {
    if (registerOpen) {
      setF({ id: "", name: "", type: "web-application", classification: "personal", remote: "", defaultBranch: "main", workingBranch: "", clone: true });
      setErr(null);
      setIdTouched(false);
    }
  }, [registerOpen]);

  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));
  const idOk = /^[a-z0-9][a-z0-9-]*$/.test(f.id);
  const valid = idOk && f.name.trim() && f.remote.trim();

  const submit = async () => {
    if (!valid) return;
    setBusy(true);
    setErr(null);
    try {
      const p = await api.registerProject({
        id: f.id,
        name: f.name.trim(),
        type: f.type,
        classification: f.classification,
        remote: f.remote.trim(),
        defaultBranch: f.defaultBranch.trim() || undefined,
        workingBranch: f.workingBranch.trim() || undefined,
        clone: f.clone,
      });
      toast(`Registered project ${p.name}`, "success");
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
        <Field label="ID" hint={f.id && !idOk ? <span className="text-critical">Lowercase letters, digits and dashes only.</span> : "Folder name under projects/ and repos/."}>
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
        <Field label="Type">
          <select value={f.type} onChange={(e) => set("type", e.target.value)}>
            {TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </Field>
        <Field label="Classification">
          <select value={f.classification} onChange={(e) => set("classification", e.target.value)}>
            <option>personal</option>
            <option>work</option>
          </select>
        </Field>
        <Field label="Git remote" span>
          <input value={f.remote} onChange={(e) => set("remote", e.target.value)} placeholder="git@github.com:org/repo.git" />
        </Field>
        <Field label="Default branch">
          <input value={f.defaultBranch} onChange={(e) => set("defaultBranch", e.target.value)} />
        </Field>
        <Field label="Working branch (optional)">
          <input value={f.workingBranch} onChange={(e) => set("workingBranch", e.target.value)} placeholder="same as default" />
        </Field>
        <label className="check span-2">
          <input type="checkbox" checked={f.clone} onChange={(e) => set("clone", e.target.checked)} />
          Clone the repository into <code>repos/{f.id || "<id>"}</code> now
        </label>
      </div>
    </Dialog>
  );
}
