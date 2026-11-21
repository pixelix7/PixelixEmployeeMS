import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import api, { getErrorMessage } from "../api/client";
import { useAuth } from "../context/useAuth";
import { ROLES, ROLE_LABELS } from "../config";
import { formatWhen } from "../utils/format";
import Modal from "../components/Modal";
import TaskForm from "../components/TaskForm";
import { DueLabel, PriorityTag, TaskStatusPill, TaskUpdateForm } from "../components/TaskBits";
import { PlusIcon, SearchIcon } from "../components/Icons";
import "../components/EmployeeForm.css";
import "../components/LeadForm.css";
import "./Employees.css";
import "./Attendance.css";
import "./Tasks.css";

const TABS = [
  { key: "open", label: "Open" },
  { key: "overdue", label: "Overdue" },
  { key: "done", label: "Completed" },
  { key: "cancelled", label: "Cancelled", adminOnly: true },
  { key: "all", label: "All" },
];

const EMPTY = {
  open: "No open tasks.",
  overdue: "Nothing overdue. 🎉",
  done: "No completed tasks yet.",
  cancelled: "No cancelled tasks.",
  all: "No tasks yet.",
};

// Keyed by URL so "loading" is derived (no setState in the effect body)
function useTasks(url) {
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

export default function Tasks() {
  const { user } = useAuth();
  const isAdmin = user.role === ROLES.ADMIN;
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((t) => t.key === params.get("tab")) ? params.get("tab") : "open";
  const employee = isAdmin ? params.get("employee") || "" : "";
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState(""); // debounced search
  const [reload, setReload] = useState(0);
  const [modal, setModal] = useState(null); // { mode: "new" } | { mode: "edit"|"update", task }
  const [toast, setToast] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [team, setTeam] = useState([]);

  useEffect(() => {
    const t = setTimeout(() => setQuery(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (!isAdmin) return;
    api
      .get("/users", { params: { limit: 100 } })
      .then(({ data }) => setTeam(data.users.filter((u) => u.role !== ROLES.ADMIN)))
      .catch(() => setTeam([]));
  }, [isAdmin]);

  const qs = new URLSearchParams({ tab, limit: 100, r: reload });
  if (employee) qs.set("user", employee);
  if (query) qs.set("q", query);
  const { data, error, loading } = useTasks(`/tasks?${qs}`);

  const update = (changes) => {
    const next = { tab, employee, ...changes };
    setParams(Object.fromEntries(Object.entries(next).filter(([, v]) => v)), { replace: true });
  };

  const done = (message) => {
    setModal(null);
    setToast(message);
    setReload((r) => r + 1);
  };

  // Employee quick actions: Start / Mark done
  const quick = async (task, status) => {
    setBusyId(task._id);
    try {
      await api.patch(`/tasks/${task._id}`, { status });
      done(status === "done" ? `Done: ${task.title}` : `Started: ${task.title}`);
    } catch (err) {
      setToast(getErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  const counts = data?.counts ?? {};
  const tasks = data?.tasks ?? [];
  const tabs = TABS.filter((t) => isAdmin || !t.adminOnly);

  return (
    <>
      <header className="att-head">
        <div className="page-head">
          <h1>{isAdmin ? "Tasks" : "My Tasks"}</h1>
          <p>{isAdmin ? "Assign work to your team and track deadlines" : "Work assigned to you by the admin"}</p>
        </div>
        {isAdmin && (
          <button type="button" className="button button-primary" onClick={() => setModal({ mode: "new" })}>
            <PlusIcon /> Assign Task
          </button>
        )}
      </header>

      <div className="task-toolbar">
        <div className="att-tabs task-tabs" role="tablist">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              className={`${tab === t.key ? "is-active" : ""} ${t.key === "overdue" && counts.overdue ? "has-alert" : ""}`}
              onClick={() => update({ tab: t.key })}
            >
              {t.label}
              <span className="task-count">{counts[t.key] ?? 0}</span>
            </button>
          ))}
        </div>
        <div className="task-filters">
          {isAdmin && (
            <select
              className="input task-employee"
              value={employee}
              onChange={(e) => update({ employee: e.target.value })}
              aria-label="Filter by employee"
            >
              <option value="">All employees</option>
              {team.map((u) => (
                <option key={u._id} value={u._id}>
                  {u.firstName} {u.lastName}
                  {u.isActive === false ? " (deactivated)" : ""}
                </option>
              ))}
            </select>
          )}
          <div className="emp-search task-search">
            <SearchIcon />
            <input
              className="input"
              type="search"
              placeholder="Search tasks..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search tasks"
            />
          </div>
        </div>
      </div>

      {error && <div className="alert task-alert">{error}</div>}

      <section className={`panel ${loading && data ? "is-refreshing" : ""}`}>
        {!data ? (
          <p className="panel-empty">{error ? "" : "Loading…"}</p>
        ) : tasks.length === 0 ? (
          <p className="panel-empty">
            {query ? "No tasks match your search." : EMPTY[tab]}
            {isAdmin && tab === "open" && !query && " Use “Assign Task” to give someone work."}
          </p>
        ) : (
          <ul className="task-list">
            {tasks.map((t) => (
              <li key={t._id} className={`task-row prio-row-${t.priority} ${t.overdue ? "is-overdue" : ""} is-${t.status}`}>
                <button
                  type="button"
                  className="task-open"
                  onClick={() => setModal({ mode: isAdmin ? "edit" : "update", task: t })}
                >
                  <span className="task-row-main">
                    <span className="task-row-title">{t.title}</span>
                    <span className="task-row-meta">
                      <PriorityTag priority={t.priority} />
                      <DueLabel task={t} />
                      {isAdmin && t.assignedTo && (
                        <span>
                          {t.assignedTo.firstName} {t.assignedTo.lastName}
                          <small> · {ROLE_LABELS[t.assignedTo.role]}</small>
                        </span>
                      )}
                      {t.status === "done" && t.completedAt && <span>Completed {formatWhen(t.completedAt)}</span>}
                      {t.updates.length > 1 && <span>{t.updates.length - 1} update{t.updates.length === 2 ? "" : "s"}</span>}
                    </span>
                  </span>
                </button>
                <span className="task-row-side">
                  <TaskStatusPill status={t.status} />
                  {!isAdmin && t.status === "todo" && (
                    <button type="button" className="button button-secondary task-quick" disabled={busyId === t._id} onClick={() => quick(t, "in_progress")}>
                      Start
                    </button>
                  )}
                  {!isAdmin && (t.status === "todo" || t.status === "in_progress") && (
                    <button type="button" className="button button-primary task-quick" disabled={busyId === t._id} onClick={() => quick(t, "done")}>
                      Mark Done
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
        {data && data.pagination.total > tasks.length && (
          <p className="panel-empty task-more">
            Showing {tasks.length} of {data.pagination.total}. Use search or the employee filter to narrow it down.
          </p>
        )}
      </section>

      {modal?.mode === "new" && (
        <Modal title="Assign Task" subtitle="Pick one or more employees and set a deadline if needed" onClose={() => setModal(null)}>
          <TaskForm defaultAssignee={employee || undefined} onSaved={done} onCancel={() => setModal(null)} />
        </Modal>
      )}
      {modal?.mode === "edit" && (
        <Modal
          title="Edit Task"
          subtitle={
            modal.task.assignedTo ? (
              <>
                Assigned to{" "}
                <Link to={`/employees/${modal.task.assignedTo._id}`}>
                  {modal.task.assignedTo.firstName} {modal.task.assignedTo.lastName}
                </Link>{" "}
                · {formatWhen(modal.task.createdAt)}
              </>
            ) : undefined
          }
          onClose={() => setModal(null)}
        >
          <TaskForm
            task={modal.task}
            onSaved={done}
            onDeleted={() => done("Task deleted")}
            onCancel={() => setModal(null)}
          />
        </Modal>
      )}
      {modal?.mode === "update" && (
        <Modal title={modal.task.title} size="md" onClose={() => setModal(null)}>
          <TaskUpdateForm task={modal.task} onSaved={(_task, message) => done(message)} onCancel={() => setModal(null)} />
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
