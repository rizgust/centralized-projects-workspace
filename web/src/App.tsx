import { useEffect, useState } from "react";
import { NavLink, Route, Routes } from "react-router-dom";
import { MOCK } from "./api/client";
import { useLive } from "./store";
import { Toasts } from "./components/ui";
import { LaunchDialog } from "./components/LaunchDialog";
import { RegisterDialog } from "./components/RegisterDialog";
import { InboxDrawer } from "./components/InboxDrawer";
import { OfficePage } from "./pages/OfficePage";
import { ProjectsPage } from "./pages/ProjectsPage";
import { ProjectDetailPage } from "./pages/ProjectDetailPage";
import { TasksPage } from "./pages/TasksPage";
import { AgentsPage } from "./pages/AgentsPage";
import { RunDetailPage } from "./pages/RunDetailPage";
import { UsagePage } from "./pages/UsagePage";
import { SystemPage } from "./pages/SystemPage";

const NAV = [
  { to: "/", label: "Office", icon: "▦", end: true },
  { to: "/projects", label: "Projects", icon: "▤" },
  { to: "/tasks", label: "Tasks", icon: "☰" },
  { to: "/agents", label: "Agents", icon: "◉" },
  { to: "/usage", label: "Usage", icon: "▥" },
  { to: "/system", label: "System", icon: "◈" },
];

type Theme = "dark" | "light";

function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      return (localStorage.getItem("pc-theme") as Theme) || "dark";
    } catch {
      return "dark";
    }
  });
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("pc-theme", theme);
    } catch {
      /* storage unavailable */
    }
  }, [theme]);
  return [theme, () => setTheme((t) => (t === "dark" ? "light" : "dark"))];
}

export function App() {
  const live = useLive();
  const [theme, toggleTheme] = useTheme();
  const running = live.runs.filter((r) => r.status === "running").length;
  const openQ = live.questions.filter((q) => q.status === "open").length;

  return (
    <div className="shell">
      <a className="skip" href="#main">
        Skip to content
      </a>
      <aside className="side">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <span className="brand-text">
            PC <span>Office</span>
          </span>
        </div>
        <nav aria-label="Main">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `nav-link${isActive ? " on" : ""}`}>
              <span className="nav-icon" aria-hidden="true">
                {n.icon}
              </span>
              {n.label}
              {n.to === "/agents" && running > 0 && (
                <span className="nav-count" aria-label={`${running} running`}>
                  {running}
                </span>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="side-foot">
          {MOCK && <span className="mock-tag">Mock data</span>}
          <span className="muted small">{live.workspace?.name ?? "workspace"}</span>
        </div>
      </aside>

      <div className="main-col">
        <header className="top">
          <label className="switcher">
            <span className="switcher-label">Active project</span>
            <select value={live.activeProject ?? ""} onChange={(e) => void live.activate(e.target.value || null)} aria-label="Active project">
              <option value="">— none (HQ) —</option>
              {live.projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <div className="top-right">
            {openQ > 0 && (
              <button className="inbox-pill" onClick={() => live.openInbox()} aria-label={`Owner inbox, ${openQ} open questions`}>
                <span aria-hidden="true">?</span> Inbox ({openQ})
              </button>
            )}
            <button className="btn btn-primary btn-sm" onClick={() => live.openLaunch()}>
              + Launch agent
            </button>
            <ConnIndicator />
            <button className="btn btn-ghost btn-sm" onClick={toggleTheme} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}>
              {theme === "dark" ? "☀ Light" : "☾ Dark"}
            </button>
          </div>
        </header>
        {live.error && (
          <div className="banner banner-error" role="alert">
            Could not reach the dashboard API: {live.error}. Is <code>pcctl dashboard</code> running? (Append <code>?mock=1</code> to the URL for demo data.)
          </div>
        )}
        <main id="main" className="content">
          <Routes>
            <Route path="/" element={<OfficePage />} />
            <Route path="/projects" element={<ProjectsPage />} />
            <Route path="/projects/:id" element={<ProjectDetailPage />} />
            <Route path="/tasks" element={<TasksPage />} />
            <Route path="/agents" element={<AgentsPage />} />
            <Route path="/agents/runs/:id" element={<RunDetailPage />} />
            <Route path="/usage" element={<UsagePage />} />
            <Route path="/system" element={<SystemPage />} />
            <Route path="*" element={<p>Not found.</p>} />
          </Routes>
        </main>
      </div>
      <LaunchDialog />
      <RegisterDialog />
      <InboxDrawer />
      <Toasts />
    </div>
  );
}

function ConnIndicator() {
  const { conn } = useLive();
  const label = conn === "open" ? "Live" : conn === "connecting" ? "Connecting" : "Reconnecting";
  return (
    <span className={`conn conn-${conn}`} role="status" aria-label={`Live updates: ${label}`}>
      <span className="conn-dot" aria-hidden="true" />
      {label}
    </span>
  );
}
