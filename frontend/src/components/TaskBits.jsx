import { useState } from "react";
import api, { getErrorMessage } from "../api/client";
import { TASK_PRIORITY_LABELS, TASK_STATUS_LABELS } from "../config";
import { formatClock, formatDay, formatWhen, todayKey } from "../utils/format";
import "./TaskBits.css";

export function TaskStatusPill({ status }) {
  return <span className={`task-pill task-${status}`}>{TASK_STATUS_LABELS[status] || status}</span>;
}

export function PriorityTag({ priority }) {
  return <span className={`task-prio prio-${priority}`}>{TASK_PRIORITY_LABELS[priority] || priority}</span>;
}

const shiftDay = (key, days) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
};

// "Overdue · Fri, 20 Nov" / "Due today, 5:00 pm" / "Due tomorrow" / "Due Wed, 25 Nov" / "No deadline"
export function DueLabel({ task, showNone = false }) {
  if (!task.dueDate) return showNone ? <span className="task-due is-none">No deadline</span> : null;
  const today = todayKey();
  const time = task.dueTime ? `, ${formatClock(task.dueTime)}` : "";
  const open = task.status === "todo" || task.status === "in_progress";
  const day =
    task.dueDate === today ? "today" : task.dueDate === shiftDay(today, 1) ? "tomorrow" : formatDay(task.dueDate);

  if (open && task.overdue) {
    return <span className="task-due is-overdue">Overdue · {task.dueDate === today ? "today" : formatDay(task.dueDate)}{time}</span>;
  }
  const soon = open && (task.dueDate === today || task.dueDate === shiftDay(today, 1));
  return (
    <span className={`task-due ${soon ? "is-soon" : ""}`}>
      Due {day}
      {time}
    </span>
  );
}

// Every change, newest first
export function TaskHistory({ updates = [] }) {
  if (!updates.length) return null;
  return (
    <div className="task-history">
      <p className="task-history-title">History</p>
      <ol>
        {[...updates].reverse().map((u, i) => (
          <li key={i}>
            <span className="task-history-dot" />
            <div>
              <p className="task-history-line">
                {u.status && <TaskStatusPill status={u.status} />}
                {u.note && <span>{u.note}</span>}
              </p>
              <p className="task-history-meta">
                {u.by ? `${u.by.firstName} ${u.by.lastName}` : "Someone"} · {formatWhen(u.at)}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

const STAFF_STATUSES = ["todo", "in_progress", "done"];

// Employee: move their task along and leave a note for the admin
export function TaskUpdateForm({ task, onSaved, onCancel }) {
  const [status, setStatus] = useState(task.status);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const locked = task.status === "cancelled";

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const { data } = await api.patch(`/tasks/${task._id}`, { status, note });
      onSaved(data.task, status !== task.status ? `Marked “${TASK_STATUS_LABELS[status]}”` : "Note added");
    } catch (err) {
      setError(getErrorMessage(err));
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit}>
      <TaskSummary task={task} />
      {error && (
        <div className="alert" role="alert">
          {error}
        </div>
      )}
      {locked ? (
        <p className="task-locked">This task was cancelled by the admin, so it can't be updated.</p>
      ) : (
        <>
          <div className="form-field">
            <label>Status</label>
            <div className="chip-row" role="radiogroup" aria-label="Status">
              {STAFF_STATUSES.map((s) => (
                <button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={status === s}
                  className={`chip ${status === s ? "is-active" : ""}`}
                  onClick={() => setStatus(s)}
                >
                  {TASK_STATUS_LABELS[s]}
                </button>
              ))}
            </div>
          </div>
          <div className="form-field task-note-field">
            <label htmlFor="task-note">Note for the admin (optional)</label>
            <textarea
              id="task-note"
              className="input lead-notes"
              rows={2}
              maxLength={1000}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={status === "done" ? "What did you finish? Any results?" : "Progress, blockers, questions…"}
            />
          </div>
        </>
      )}
      <TaskHistory updates={task.updates} />
      <div className="form-actions">
        <button type="button" className="button button-secondary" onClick={onCancel}>
          Close
        </button>
        {!locked && (
          <button
            type="submit"
            className="button button-primary"
            disabled={saving || (status === task.status && !note.trim())}
          >
            {saving ? "Saving…" : "Save Update"}
          </button>
        )}
      </div>
    </form>
  );
}

// Title block shown at the top of task dialogs
export function TaskSummary({ task }) {
  return (
    <div className="task-summary">
      <div className="task-summary-tags">
        <PriorityTag priority={task.priority} />
        <TaskStatusPill status={task.status} />
        <DueLabel task={task} showNone />
      </div>
      {task.description && <p className="task-summary-desc">{task.description}</p>}
      <p className="task-summary-meta">
        Assigned by {task.assignedBy ? `${task.assignedBy.firstName} ${task.assignedBy.lastName}` : "Admin"} ·{" "}
        {formatWhen(task.createdAt)}
        {task.completedAt && ` · Completed ${formatWhen(task.completedAt)}`}
      </p>
    </div>
  );
}
