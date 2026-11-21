import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api, { getErrorMessage } from "../api/client";
import Modal from "./Modal";
import { DueLabel, PriorityTag, TaskStatusPill, TaskUpdateForm } from "./TaskBits";
import { ArrowRightIcon, TaskIcon } from "./Icons";
import "./TaskBits.css";

const SHOWN = 5;

// Employee dashboard: open tasks from the admin, soonest deadline first.
// Hidden for people who have never been given a task.
export default function MyTasksPanel() {
  const [data, setData] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [open, setOpen] = useState(null);
  const [toast, setToast] = useState("");

  const load = useCallback(
    () =>
      api
        .get("/tasks", { params: { tab: "open", limit: SHOWN } })
        .then(({ data }) => setData(data))
        .catch(() => setData(null)),
    []
  );

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  if (!data || data.counts.all === 0) return null;

  const markDone = async (task) => {
    setBusyId(task._id);
    try {
      await api.patch(`/tasks/${task._id}`, { status: "done" });
      setToast(`Done: ${task.title}`);
      await load();
    } catch (err) {
      setToast(getErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  const { counts, tasks } = data;

  return (
    <section className="panel mt-panel">
      <div className="panel-head">
        <h2 className="mt-title">
          <TaskIcon width={18} height={18} />
          My Tasks
          {counts.open > 0 && <span className="mt-count">{counts.open} open</span>}
          {counts.overdue > 0 && <span className="mt-count is-overdue">{counts.overdue} overdue</span>}
        </h2>
        <Link to="/tasks" className="panel-link">
          All tasks <ArrowRightIcon width={16} height={16} />
        </Link>
      </div>
      {tasks.length === 0 ? (
        <p className="panel-empty">All caught up — no open tasks. {counts.done > 0 && `${counts.done} completed so far.`}</p>
      ) : (
        <ul className="mt-list">
          {tasks.map((t) => (
            <li key={t._id} className={`mt-item prio-row-${t.priority} ${t.overdue ? "is-overdue" : ""}`}>
              <button type="button" className="mt-open" onClick={() => setOpen(t)}>
                <span className="mt-name">{t.title}</span>
                <span className="task-row-meta">
                  <PriorityTag priority={t.priority} />
                  <DueLabel task={t} />
                  {t.assignedBy && <span>From {t.assignedBy.firstName}</span>}
                </span>
              </button>
              <TaskStatusPill status={t.status} />
              <button
                type="button"
                className="button button-secondary mt-done"
                disabled={busyId === t._id}
                onClick={() => markDone(t)}
              >
                {busyId === t._id ? "Saving…" : "Mark Done"}
              </button>
            </li>
          ))}
        </ul>
      )}
      {counts.open > tasks.length && (
        <p className="mt-more">
          <Link to="/tasks">+{counts.open - tasks.length} more open task{counts.open - tasks.length === 1 ? "" : "s"}</Link>
        </p>
      )}

      {open && (
        <Modal title={open.title} size="md" onClose={() => setOpen(null)}>
          <TaskUpdateForm
            task={open}
            onCancel={() => setOpen(null)}
            onSaved={(_task, message) => {
              setOpen(null);
              setToast(message);
              load();
            }}
          />
        </Modal>
      )}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </section>
  );
}
