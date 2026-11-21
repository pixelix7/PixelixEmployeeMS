import { useEffect, useState } from "react";
import api, { getErrorMessage } from "../api/client";
import { ROLES, TASK_PRIORITIES, TASK_STATUS_LABELS } from "../config";
import { todayKey } from "../utils/format";
import { TaskHistory } from "./TaskBits";
import EmployeePicker from "./EmployeePicker";
import "./EmployeeForm.css";
import "./LeadForm.css";
import "./TaskBits.css";

// Admin: assign a new task to one or more employees, or edit an existing one.
export default function TaskForm({ task, defaultAssignee, onSaved, onDeleted, onCancel }) {
  const isEdit = Boolean(task);
  const [team, setTeam] = useState(null);
  const [values, setValues] = useState(() => ({
    assignees: defaultAssignee ? [defaultAssignee] : [],
    assignedTo: task?.assignedTo?._id || "",
    title: task?.title || "",
    description: task?.description || "",
    priority: task?.priority || "medium",
    dueDate: task?.dueDate || "",
    dueTime: task?.dueTime || "",
    status: task?.status || "todo",
    note: "",
  }));
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    api
      .get("/users", { params: { status: "active", limit: 100 } })
      .then(({ data }) => setTeam(data.users.filter((u) => u.role !== ROLES.ADMIN)))
      .catch(() => setTeam([]));
  }, []);

  const set = (field, value) => {
    setValues((v) => {
      const next = { ...v, [field]: value };
      if (field === "dueDate" && !value) next.dueTime = "";
      return next;
    });
    setErrors((e) => ({ ...e, [field === "assignees" ? "assignedTo" : field]: undefined }));
    setFormError("");
  };

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    setFormError("");
    const details = {
      title: values.title,
      description: values.description,
      priority: values.priority,
      dueDate: values.dueDate,
      dueTime: values.dueTime,
    };
    try {
      const { data } = isEdit
        ? await api.patch(`/tasks/${task._id}`, {
            ...details,
            assignedTo: values.assignedTo,
            status: values.status,
            note: values.note,
          })
        : await api.post("/tasks", { ...details, assignees: values.assignees });
      onSaved(data.message);
    } catch (err) {
      const fieldErrors = err.response?.data?.errors;
      if (fieldErrors) setErrors(fieldErrors);
      else setFormError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setSaving(true);
    try {
      await api.delete(`/tasks/${task._id}`);
      onDeleted();
    } catch (err) {
      setFormError(getErrorMessage(err));
      setSaving(false);
    }
  };

  // In edit mode the current assignee may have been deactivated since
  const editOptions =
    isEdit && task.assignedTo && !(team ?? []).some((u) => u._id === task.assignedTo._id)
      ? [...(team ?? []), task.assignedTo]
      : (team ?? []);

  return (
    <form onSubmit={submit} noValidate>
      {formError && (
        <div className="alert" role="alert">
          {formError}
        </div>
      )}

      <div className="form-grid">
        {isEdit ? (
          <div className="form-field">
            <label htmlFor="task-assignee">Assigned to</label>
            <select
              id="task-assignee"
              className={`input ${errors.assignedTo ? "has-error" : ""}`}
              value={values.assignedTo}
              onChange={(e) => set("assignedTo", e.target.value)}
            >
              {editOptions.map((u) => (
                <option key={u._id} value={u._id}>
                  {u.firstName} {u.lastName}
                  {u.isActive === false ? " (deactivated)" : ""}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="form-field is-wide">
            <label>
              Assign to{" "}
              {values.assignees.length > 0 && <span className="task-picked">{values.assignees.length} selected</span>}
            </label>
            <EmployeePicker
              team={team}
              value={values.assignees}
              onChange={(ids) => set("assignees", ids)}
              hasError={Boolean(errors.assignedTo)}
            />
            {errors.assignedTo && <p className="form-error">{errors.assignedTo}</p>}
            {values.assignees.length > 1 && (
              <p className="form-hint">Each person gets their own copy of the task to update.</p>
            )}
          </div>
        )}

        {isEdit && (
          <div className="form-field">
            <label htmlFor="task-status">Status</label>
            <select id="task-status" className="input" value={values.status} onChange={(e) => set("status", e.target.value)}>
              {Object.entries(TASK_STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="form-field is-wide">
          <label htmlFor="task-title">Task</label>
          <input
            id="task-title"
            className={`input ${errors.title ? "has-error" : ""}`}
            value={values.title}
            maxLength={150}
            onChange={(e) => set("title", e.target.value)}
            placeholder="e.g. Call back all leads from last week"
            autoFocus={!isEdit}
          />
          {errors.title && <p className="form-error">{errors.title}</p>}
        </div>

        <div className="form-field is-wide">
          <label htmlFor="task-desc">Details (optional)</label>
          <textarea
            id="task-desc"
            className="input lead-notes"
            rows={3}
            maxLength={2000}
            value={values.description}
            onChange={(e) => set("description", e.target.value)}
            placeholder="Instructions, links, what 'done' looks like…"
          />
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
          <label htmlFor="task-due">Deadline (optional)</label>
          <input
            id="task-due"
            type="date"
            className={`input ${errors.dueDate ? "has-error" : ""}`}
            value={values.dueDate}
            min={isEdit ? undefined : todayKey()}
            onChange={(e) => set("dueDate", e.target.value)}
          />
          {errors.dueDate && <p className="form-error">{errors.dueDate}</p>}
        </div>
        <div className="form-field">
          <label htmlFor="task-time">Time (optional)</label>
          <input
            id="task-time"
            type="time"
            className={`input ${errors.dueTime ? "has-error" : ""}`}
            value={values.dueTime}
            disabled={!values.dueDate}
            onChange={(e) => set("dueTime", e.target.value)}
          />
          {errors.dueTime ? (
            <p className="form-error">{errors.dueTime}</p>
          ) : (
            values.dueDate && !values.dueTime && <p className="form-hint">No time = end of the day</p>
          )}
        </div>

        {isEdit && (
          <div className="form-field is-wide">
            <label htmlFor="task-admin-note">Add a note (optional)</label>
            <input
              id="task-admin-note"
              className="input"
              maxLength={1000}
              value={values.note}
              onChange={(e) => set("note", e.target.value)}
              placeholder="e.g. Please prioritise the Mumbai leads"
            />
          </div>
        )}
      </div>

      {isEdit && <TaskHistory updates={task.updates} />}

      <div className="form-actions task-actions">
        {isEdit &&
          (confirmDelete ? (
            <span className="task-delete-confirm">
              Delete for good?
              <button type="button" className="button button-danger" onClick={remove} disabled={saving}>
                Delete
              </button>
              <button type="button" className="button button-secondary" onClick={() => setConfirmDelete(false)}>
                Keep
              </button>
            </span>
          ) : (
            <button type="button" className="task-delete" onClick={() => setConfirmDelete(true)}>
              Delete
            </button>
          ))}
        <button type="button" className="button button-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="submit"
          className="button button-primary"
          disabled={saving || !values.title.trim() || (!isEdit && values.assignees.length === 0)}
        >
          {saving
            ? "Saving…"
            : isEdit
              ? "Save Changes"
              : values.assignees.length > 1
                ? `Assign to ${values.assignees.length}`
                : "Assign Task"}
        </button>
      </div>
    </form>
  );
}
