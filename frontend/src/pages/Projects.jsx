import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import api, { getErrorMessage } from "../api/client";
import { useAuth } from "../context/useAuth";
import { ROLES } from "../config";
import Modal from "../components/Modal";
import { DueBadge, ProgressBar, ProjectDetail, ProjectForm, ProjectStatusPill, TeamAvatars } from "../components/ProjectBits";
import { PriorityTag } from "../components/TaskBits";
import { PlusIcon, SearchIcon } from "../components/Icons";
import "./Employees.css";
import "./Attendance.css";
import "./Projects.css";

const TABS = [
  { key: "active", label: "Active" },
  { key: "on_hold", label: "On hold" },
  { key: "completed", label: "Completed" },
  { key: "all", label: "All" },
];

// Keyed by URL so "loading" is derived (no setState in the effect body)
function useFetch(url) {
  const [result, setResult] = useState({ url: null, data: null, error: "" });
  useEffect(() => {
    let cancelled = false;
    api
      .get(url)
      .then(({ data }) => !cancelled && setResult({ url, data, error: "" }))
      .catch((err) => !cancelled && setResult({ url, data: null, error: getErrorMessage(err) }));
    return () => {
      cancelled = true;
    };
  }, [url]);
  return { ...result, loading: result.url !== url };
}

export default function Projects() {
  const { user } = useAuth();
  const isAdmin = user.role === ROLES.ADMIN;
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((t) => t.key === params.get("tab")) ? params.get("tab") : "active";
  const client = isAdmin ? params.get("client") || "" : "";
  const member = isAdmin ? params.get("member") || "" : "";
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [reload, setReload] = useState(0);
  const [clients, setClients] = useState([]);
  const [team, setTeam] = useState([]);
  const [modal, setModal] = useState(null); // { mode: "new" | "view" | "edit", project? }
  const [toast, setToast] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setQuery(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (!isAdmin) return;
    api.get("/clients", { params: { limit: 100 } }).then(({ data }) => setClients(data.clients)).catch(() => setClients([]));
    api
      .get("/users", { params: { limit: 100 } })
      .then(({ data }) => setTeam(data.users.filter((u) => u.role !== ROLES.ADMIN)))
      .catch(() => setTeam([]));
  }, [isAdmin]);

  const qs = new URLSearchParams({ tab, r: reload });
  if (client) qs.set("client", client);
  if (member) qs.set("member", member);
  if (query) qs.set("q", query);
  const { data, error, loading } = useFetch(`/projects?${qs}`);

  const update = (changes) => {
    const next = { tab, client, member, ...changes };
    setParams(Object.fromEntries(Object.entries(next).filter(([, v]) => v)), { replace: true });
  };

  const open = async (id) => {
    try {
      const { data } = await api.get(`/projects/${id}`);
      setModal({ mode: "view", project: data.project });
    } catch (err) {
      setToast(getErrorMessage(err));
    }
  };

  const changed = (message, project) => {
    setToast(message);
    setReload((r) => r + 1);
    setModal(project ? { mode: "view", project } : null);
  };

  const remove = async (project) => {
    try {
      await api.delete(`/projects/${project._id}`);
      changed("Project deleted");
    } catch (err) {
      setToast(getErrorMessage(err));
    }
  };

  const projects = data?.projects ?? [];
  const counts = data?.counts ?? {};

  return (
    <>
      <header className="att-head">
        <div className="page-head">
          <h1>{isAdmin ? "Projects" : "My Projects"}</h1>
          <p>{isAdmin ? "Client projects, deadlines and who's working on them" : "Client projects you're working on — post progress as you go"}</p>
        </div>
        {isAdmin && (
          <button type="button" className="button button-primary" onClick={() => setModal({ mode: "new" })}>
            <PlusIcon /> New Project
          </button>
        )}
      </header>

      <div className="proj-toolbar">
        <div className="att-tabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              className={tab === t.key ? "is-active" : ""}
              onClick={() => update({ tab: t.key })}
            >
              {t.label}
              <span className="proj-count">{counts[t.key] ?? 0}</span>
            </button>
          ))}
        </div>
        <div className="proj-filters">
          {isAdmin && (
            <>
              <select className="input" value={client} onChange={(e) => update({ client: e.target.value })} aria-label="Filter by client">
                <option value="">All clients</option>
                {clients.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <select className="input" value={member} onChange={(e) => update({ member: e.target.value })} aria-label="Filter by employee">
                <option value="">Everyone</option>
                {team.map((u) => (
                  <option key={u._id} value={u._id}>
                    {u.firstName} {u.lastName}
                  </option>
                ))}
              </select>
            </>
          )}
          <div className="emp-search proj-search">
            <SearchIcon />
            <input
              className="input"
              type="search"
              placeholder="Project or client name…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search projects"
            />
          </div>
        </div>
      </div>

      {error && <div className="alert proj-alert">{error}</div>}

      {!data ? (
        <section className="panel">
          <p className="panel-empty">{error ? "" : "Loading…"}</p>
        </section>
      ) : projects.length === 0 ? (
        <section className="panel">
          <p className="panel-empty">
            {query
              ? "No projects match your search."
              : isAdmin
                ? tab === "active"
                  ? "No active projects. Use “New Project” to start one for a client."
                  : "No projects here."
                : tab === "active"
                  ? "You're not on any active projects right now."
                  : "No projects here."}
          </p>
        </section>
      ) : (
        <div className={`proj-grid ${loading ? "is-refreshing" : ""}`}>
          {projects.map((p) => (
            <button key={p._id} type="button" className={`proj-card is-${p.status}`} onClick={() => open(p._id)}>
              <span className="proj-card-top">
                <ProjectStatusPill status={p.status} />
                <PriorityTag priority={p.priority} />
              </span>
              <span className="proj-card-name">{p.name}</span>
              <span className="proj-card-client">{p.client ? `${p.client.name}${p.client.city ? ` · ${p.client.city}` : ""}` : "Client removed"}</span>
              <ProgressBar value={p.progress} status={p.status} />
              <span className="proj-card-foot">
                <DueBadge project={p} />
                <TeamAvatars team={p.team} />
              </span>
            </button>
          ))}
        </div>
      )}

      {modal?.mode === "new" && (
        <Modal title="New Project" subtitle="Pick the client, set a deadline and choose the team" onClose={() => setModal(null)}>
          <ProjectForm defaultClient={client || undefined} onSaved={changed} onCancel={() => setModal(null)} />
        </Modal>
      )}
      {modal?.mode === "edit" && (
        <Modal title={`Edit ${modal.project.name}`} onClose={() => setModal({ mode: "view", project: modal.project })}>
          <ProjectForm project={modal.project} onSaved={changed} onCancel={() => setModal({ mode: "view", project: modal.project })} />
        </Modal>
      )}
      {modal?.mode === "view" && (
        <Modal title={modal.project.name} subtitle={modal.project.client?.name} onClose={() => setModal(null)}>
          <ProjectDetail
            project={modal.project}
            isAdmin={isAdmin}
            onChanged={(project, message) => {
              setToast(message);
              setReload((r) => r + 1);
              setModal({ mode: "view", project });
            }}
            actions={
              isAdmin ? (
                <AdminActions
                  project={modal.project}
                  onEdit={() => setModal({ mode: "edit", project: modal.project })}
                  onDelete={() => remove(modal.project)}
                  onClose={() => setModal(null)}
                />
              ) : (
                <button type="button" className="button button-secondary" onClick={() => setModal(null)}>
                  Close
                </button>
              )
            }
          />
        </Modal>
      )}

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </>
  );
}

function AdminActions({ project, onEdit, onDelete, onClose }) {
  const [confirm, setConfirm] = useState(false);
  return (
    <>
      {confirm ? (
        <span className="task-delete-confirm">
          Delete “{project.name}”?
          <button type="button" className="button button-danger" onClick={onDelete}>
            Delete
          </button>
          <button type="button" className="button button-secondary" onClick={() => setConfirm(false)}>
            Keep
          </button>
        </span>
      ) : (
        <button type="button" className="task-delete" onClick={() => setConfirm(true)}>
          Delete project
        </button>
      )}
      <button type="button" className="button button-secondary" onClick={onClose}>
        Close
      </button>
      <button type="button" className="button button-primary" onClick={onEdit}>
        Edit Project
      </button>
    </>
  );
}
