import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api, { getErrorMessage } from "../api/client";
import { PROJECT_STATUSES, PROJECT_STATUS_LABELS, ROLES, ROLE_LABELS, TASK_PRIORITIES } from "../config";
import { formatDate, formatPhone, formatWhen, todayKey } from "../utils/format";
import EmployeePicker from "./EmployeePicker";
import { PriorityTag } from "./TaskBits";
import { GlobeIcon, MailIcon, PhoneIcon } from "./Icons";
import "./EmployeeForm.css";
import "./LeadForm.css";
import "./ClientBits.css";
import "./ProjectBits.css";

export function ProjectStatusPill({ status }) {
  return <span className={`proj-pill proj-${status}`}>{PROJECT_STATUS_LABELS[status] || status}</span>;
}

export function ProgressBar({ value, status }) {
  return (
    <div className={`proj-progress is-${status}`} role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
      <span className="proj-progress-track">
        <i style={{ width: `${value}%` }} />
      </span>
      <strong>{value}%</strong>
    </div>
  );
}

const daysBetween = (from, to) => {
  const toUtc = (k) => {
    const [y, m, d] = k.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((toUtc(to) - toUtc(from)) / 86400e3);
};

// "Overdue by 3 days" / "Due today" / "Due in 2 days" / "Due 30 Nov 2026"
export function DueBadge({ project }) {
  if (!project.dueDate) return <span className="proj-due is-none">No deadline</span>;
  const open = project.status !== "completed" && project.status !== "cancelled";
  const left = daysBetween(todayKey(), project.dueDate);
  if (open && left < 0) return <span className="proj-due is-overdue">Overdue by {-left} day{left === -1 ? "" : "s"}</span>;
  if (open && left === 0) return <span className="proj-due is-soon">Due today</span>;
  if (open && left <= 7) return <span className="proj-due is-soon">Due in {left} day{left === 1 ? "" : "s"}</span>;
  return <span className="proj-due">Due {formatDate(project.dueDate)}</span>;
}

export function TeamAvatars({ team, max = 4 }) {
  if (!team.length) return <span className="proj-noteam">No team yet</span>;
  return (
    <span className="proj-avatars" title={team.map((u) => `${u.firstName} ${u.lastName}`).join(", ")}>
      {team.slice(0, max).map((u) => (
        <span key={u._id} className="person-avatar">
          {u.firstName[0]}
        </span>
      ))}
      {team.length > max && <span className="person-avatar proj-more">+{team.length - max}</span>}
    </span>
  );
}

/* ---------------- Admin form ---------------- */

export function ProjectForm({ project, defaultClient, onSaved, onCancel }) {
  const isEdit = Boolean(project);
  const [values, setValues] = useState(() => ({
    name: project?.name || "",
    client: project?.client?._id || defaultClient || "",
    description: project?.description || "",
    status: project?.status || "planning",
    priority: project?.priority || "medium",
    startDate: project?.startDate || todayKey(),
    dueDate: project?.dueDate || "",
    progress: project?.progress ?? 0,
    team: project?.team?.map((u) => u._id) ?? [],
  }));
  const [clients, setClients] = useState([]);
  const [staff, setStaff] = useState(null);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .get("/clients", { params: { limit: 100 } })
      .then(({ data }) => setClients(data.clients))
      .catch(() => setClients([]));
    api
      .get("/users", { params: { status: "active", limit: 100 } })
      .then(({ data }) => {
        const active = data.users.filter((u) => u.role !== ROLES.ADMIN);
        const extra = (project?.team ?? []).filter((u) => !active.some((a) => a._id === u._id));
        setStaff([...active, ...extra]);
      })
      .catch(() => setStaff([]));
  }, [project]);

  const set = (field, value) => {
    setValues((v) => ({ ...v, [field]: value }));
    setErrors((e) => ({ ...e, [field]: undefined }));
    setFormError("");
  };

  const chosenClient = clients.find((c) => c._id === values.client);
  // People who already handle the chosen client (and aren't on the team yet)
  const clientTeam = (chosenClient?.assignedTo ?? []).filter((u) => u.isActive !== false && !values.team.includes(u._id));

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    setFormError("");
    try {
      const { data } = isEdit ? await api.patch(`/projects/${project._id}`, values) : await api.post("/projects", values);
      onSaved(data.message, data.project);
    } catch (err) {
      const fieldErrors = err.response?.data?.errors;
      if (fieldErrors) {
        setErrors(fieldErrors);
        setFormError("Please fix the highlighted fields.");
      } else setFormError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate>
      {formError && (
        <div className="alert" role="alert">
          {formError}
        </div>
      )}
      <div className="form-grid">
        <div className="form-field is-wide">
          <label htmlFor="proj-name">Project name *</label>
          <input
            id="proj-name"
            className={`input ${errors.name ? "has-error" : ""}`}
            value={values.name}
            maxLength={120}
            onChange={(e) => set("name", e.target.value)}
            placeholder="e.g. Diwali Instagram Campaign"
            autoFocus={!isEdit}
          />
          {errors.name && <p className="form-error">{errors.name}</p>}
        </div>
        <div className="form-field is-wide">
          <label htmlFor="proj-client">Client *</label>
          <select
            id="proj-client"
            className={`input ${errors.client ? "has-error" : ""}`}
            value={values.client}
            onChange={(e) => set("client", e.target.value)}
          >
            <option value="">Choose a client…</option>
            {clients.map((c) => (
              <option key={c._id} value={c._id}>
                {c.name}
                {c.city ? ` · ${c.city}` : ""}
                {c.status !== "active" ? ` (${c.status.replace("_", " ")})` : ""}
              </option>
            ))}
          </select>
          {errors.client && <p className="form-error">{errors.client}</p>}
          {clients.length === 0 && <p className="form-hint">Add a client first under Clients.</p>}
        </div>
        <div className="form-field is-wide">
          <label htmlFor="proj-desc">Description / scope</label>
          <textarea
            id="proj-desc"
            className={`input lead-notes ${errors.description ? "has-error" : ""}`}
            rows={3}
            maxLength={3000}
            value={values.description}
            onChange={(e) => set("description", e.target.value)}
            placeholder="What needs to be delivered, links, notes for the team…"
          />
        </div>
        <div className="form-field is-wide">
          <label>Status</label>
          <div className="chip-row" role="radiogroup" aria-label="Status">
            {PROJECT_STATUSES.map((s) => (
              <button
                key={s.value}
                type="button"
                role="radio"
                aria-checked={values.status === s.value}
                className={`chip ${values.status === s.value ? "is-active" : ""}`}
                onClick={() => set("status", s.value)}
              >
                {s.label}
              </button>
            ))}
          </div>
          {errors.status && <p className="form-error">{errors.status}</p>}
        </div>
        <div className="form-field is-wide">
          <label>Priority</label>
          <div className="chip-row" role="radiogroup" aria-label="Priority">
            {TASK_PRIORITIES.map((p) => (
              <button
                key={p.value}
                type="button"
                role="radio"
                aria-checked={values.priority === p.value}
                className={`chip prio-chip-${p.value} ${values.priority === p.value ? "is-active" : ""}`}
                onClick={() => set("priority", p.value)}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <div className="form-field">
          <label htmlFor="proj-start">Start date</label>
          <input id="proj-start" type="date" className={`input ${errors.startDate ? "has-error" : ""}`} value={values.startDate} onChange={(e) => set("startDate", e.target.value)} />
        </div>
        <div className="form-field">
          <label htmlFor="proj-due">Deadline</label>
          <input id="proj-due" type="date" className={`input ${errors.dueDate ? "has-error" : ""}`} value={values.dueDate} onChange={(e) => set("dueDate", e.target.value)} />
          {errors.dueDate && <p className="form-error">{errors.dueDate}</p>}
        </div>
        <div className="form-field is-wide">
          <label htmlFor="proj-progress">
            Progress <strong>{values.status === "completed" ? 100 : values.progress}%</strong>
          </label>
          <input
            id="proj-progress"
            type="range"
            min={0}
            max={100}
            step={5}
            className="proj-range"
            value={values.status === "completed" ? 100 : values.progress}
            disabled={values.status === "completed"}
            onChange={(e) => set("progress", Number(e.target.value))}
          />
        </div>
      </div>

      <p className="form-section">
        Team {values.team.length > 0 && <span className="task-picked">{values.team.length} selected</span>}
      </p>
      {clientTeam.length > 0 && (
        <button type="button" className="proj-suggest" onClick={() => set("team", [...values.team, ...clientTeam.map((u) => u._id)])}>
          + Add {chosenClient.name}'s team: {clientTeam.map((u) => u.firstName).join(", ")}
        </button>
      )}
      <EmployeePicker team={staff} value={values.team} onChange={(ids) => set("team", ids)} />
      <p className="form-hint">Team members see this project under “Projects” and can post progress updates.</p>

      <div className="form-actions">
        <button type="button" className="button button-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="button button-primary" disabled={saving || !values.name.trim() || !values.client}>
          {saving ? "Saving…" : isEdit ? "Save Changes" : "Create Project"}
        </button>
      </div>
    </form>
  );
}

/* ---------------- Detail (admin + team) ---------------- */

export function ProjectDetail({ project: p, isAdmin, onChanged, actions }) {
  const [note, setNote] = useState("");
  const [progress, setProgress] = useState(p.progress);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const locked = p.status === "completed" || p.status === "cancelled";
  const c = p.client;

  const post = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const { data } = await api.post(`/projects/${p._id}/updates`, { note, progress });
      setNote("");
      onChanged(data.project, data.message);
    } catch (err) {
      const fe = err.response?.data?.errors;
      setError(fe ? Object.values(fe)[0] : getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="proj-detail">
      <div className="proj-detail-tags">
        <ProjectStatusPill status={p.status} />
        <PriorityTag priority={p.priority} />
        <DueBadge project={p} />
      </div>
      <ProgressBar value={p.progress} status={p.status} />

      {p.description && <p className="proj-desc">{p.description}</p>}

      <dl className="client-grid proj-facts">
        <div className="client-item">
          <dt>Start date</dt>
          <dd>{formatDate(p.startDate)}</dd>
        </div>
        <div className="client-item">
          <dt>Deadline</dt>
          <dd>{formatDate(p.dueDate)}</dd>
        </div>
        {p.completedAt && (
          <div className="client-item">
            <dt>Completed</dt>
            <dd>{formatWhen(p.completedAt)}</dd>
          </div>
        )}
      </dl>

      {c && (
        <>
          <p className="client-detail-title">Client</p>
          <div className="proj-client">
            <div>
              <strong>{c.name}</strong>
              <span className="att-muted">{[c.contactPerson, c.industry, c.city].filter(Boolean).join(" · ")}</span>
            </div>
            <div className="client-quick">
              <a href={`tel:${c.phone}`} className="client-quick-link">
                <PhoneIcon width={16} height={16} /> {formatPhone(c.phone)}
              </a>
              {c.email && (
                <a href={`mailto:${c.email}`} className="client-quick-link">
                  <MailIcon width={16} height={16} /> {c.email}
                </a>
              )}
              {c.website && (
                <a href={c.website} target="_blank" rel="noreferrer noopener" className="client-quick-link">
                  <GlobeIcon width={16} height={16} /> {c.website.replace(/^https?:\/\//, "")}
                </a>
              )}
            </div>
          </div>
        </>
      )}

      <p className="client-detail-title">Team</p>
      {p.team.length === 0 ? (
        <p className="client-unassigned">No one is on this project yet.</p>
      ) : (
        <ul className="client-people">
          {p.team.map((u) => (
            <li key={u._id}>
              <span className="person-avatar">{u.firstName[0]}</span>
              <span>
                {isAdmin ? <Link to={`/employees/${u._id}`}>{u.firstName} {u.lastName}</Link> : `${u.firstName} ${u.lastName}`}
                <small>{ROLE_LABELS[u.role]}</small>
              </span>
            </li>
          ))}
        </ul>
      )}

      <p className="client-detail-title">Updates</p>
      {!locked && (
        <form className="proj-update" onSubmit={post}>
          {error && <p className="form-error">{error}</p>}
          <textarea
            className="input lead-notes"
            rows={2}
            maxLength={1000}
            value={note}
            onChange={(e) => {
              setNote(e.target.value);
              setError("");
            }}
            placeholder="What's done, what's next, anything blocking?"
            aria-label="Progress update"
          />
          <div className="proj-update-row">
            <label className="proj-update-progress">
              Progress
              <input type="range" min={0} max={100} step={5} className="proj-range" value={progress} onChange={(e) => setProgress(Number(e.target.value))} />
              <strong>{progress}%</strong>
            </label>
            <button type="submit" className="button button-primary" disabled={saving || (!note.trim() && progress === p.progress)}>
              {saving ? "Posting…" : "Post Update"}
            </button>
          </div>
        </form>
      )}
      <ol className="proj-timeline">
        {[...p.updates].reverse().map((u, i) => (
          <li key={i}>
            <p className="proj-timeline-line">
              {u.status && <ProjectStatusPill status={u.status} />}
              {u.progress != null && <span className="proj-timeline-progress">{u.progress}%</span>}
              {u.note && <span>{u.note}</span>}
            </p>
            <small>
              {u.by ? `${u.by.firstName} ${u.by.lastName}` : "Someone"} · {formatWhen(u.at)}
            </small>
          </li>
        ))}
      </ol>

      {actions && <div className="form-actions client-actions">{actions}</div>}
    </div>
  );
}

/* ---------------- On the client page (admin) ---------------- */

export function ClientProjects({ clientId }) {
  const [result, setResult] = useState({ projects: null, error: "" });

  useEffect(() => {
    let cancelled = false;
    api
      .get("/projects", { params: { tab: "all", client: clientId } })
      .then(({ data }) => !cancelled && setResult({ projects: data.projects, error: "" }))
      .catch((err) => !cancelled && setResult({ projects: [], error: getErrorMessage(err) }));
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  const { projects, error } = result;
  return (
    <>
      <p className="client-detail-title">
        Projects {projects && `(${projects.length})`}
        <Link to={`/projects?tab=all&client=${clientId}`} className="proj-client-link">
          Open in Projects →
        </Link>
      </p>
      {error && <p className="form-error">{error}</p>}
      {!projects ? (
        <p className="att-muted">Loading…</p>
      ) : projects.length === 0 ? (
        <p className="att-muted">No projects for this client yet.</p>
      ) : (
        <ul className="proj-mini">
          {projects.map((p) => (
            <li key={p._id}>
              <span className="proj-mini-name">{p.name}</span>
              <ProjectStatusPill status={p.status} />
              <span className="proj-mini-progress">{p.progress}%</span>
              <DueBadge project={p} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
