import { useEffect, useState } from "react";
import api, { getErrorMessage } from "../api/client";
import { useAuth } from "../context/useAuth";
import { ROLES, WORK_CATEGORIES, WORK_STATUS_LABELS, workStatusesFor } from "../config";
import { formatWhen } from "../utils/format";
import { CategoryBadge, WorkStatusPill } from "./WorkBits";
import "./EmployeeForm.css";
import "./LeadForm.css";
import "./WorkItemForm.css";

// Due dates are whole days: store the end of the chosen day (local time)
const dueToInput = (date) => {
  if (!date) return "";
  const d = new Date(date);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const inputToDue = (value) => (value ? new Date(`${value}T23:59:00`).toISOString() : null);

// Create a work entry (no `item`), assign a task (admin), or update an existing item.
export default function WorkItemForm({ item, defaultCategory, onSaved, onDeleted, onCancel }) {
  const { user } = useAuth();
  const isAdmin = user.role === ROLES.ADMIN;
  const isEdit = Boolean(item);
  // Marketers can't change what an admin asked for, only its status and notes
  const detailsLocked = isEdit && Boolean(item.assignedBy) && !isAdmin;

  const [values, setValues] = useState(() => ({
    owner: item?.owner?._id || "",
    category: item?.category || defaultCategory || (isAdmin ? "other_tasks" : WORK_CATEGORIES[0].value),
    title: item?.title || "",
    client: item?.client || "",
    details: item?.details || "",
    status: item?.status || "pending",
    dueDate: dueToInput(item?.dueDate),
    note: "",
  }));
  const [team, setTeam] = useState([]); // digital marketers, for admins assigning
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!isAdmin || isEdit) return;
    api
      .get("/users", { params: { role: "digital_marketing", status: "active", limit: 100 } })
      .then(({ data }) => setTeam(data.users))
      .catch(() => setTeam([]));
  }, [isAdmin, isEdit]);

  const statuses = workStatusesFor(values.category);

  const set = (field, value) => {
    setValues((v) => {
      const next = { ...v, [field]: value };
      // Switching category can make the status invalid (e.g. "Completed" -> audit)
      if (field === "category" && !workStatusesFor(value).includes(next.status)) next.status = "pending";
      return next;
    });
    if (errors[field]) setErrors((e) => ({ ...e, [field]: undefined }));
    setFormError("");
  };

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    setFormError("");

    const payload = {
      status: values.status,
      note: values.note,
      ...(!detailsLocked && {
        category: values.category,
        title: values.title,
        client: values.client,
        details: values.details,
        dueDate: inputToDue(values.dueDate),
      }),
      ...(!isEdit && isAdmin && { owner: values.owner }),
    };

    try {
      const { data } = isEdit
        ? await api.patch(`/work/${item._id}`, payload)
        : await api.post("/work", payload);
      onSaved(data.item, isEdit ? "Work updated" : data.message);
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
      await api.delete(`/work/${item._id}`);
      onDeleted?.(item);
    } catch (err) {
      setFormError(getErrorMessage(err));
      setSaving(false);
    }
  };

  const canDelete = isEdit && (isAdmin || !item.assignedBy);

  return (
    <form className="work-form" onSubmit={submit} noValidate>
      {formError && (
        <div className="alert" role="alert">
          {formError}
        </div>
      )}

      {detailsLocked ? (
        <div className="work-locked">
          <div className="work-locked-head">
            <CategoryBadge category={item.category} />
            <span>
              Assigned by {item.assignedBy.firstName} {item.assignedBy.lastName}
            </span>
          </div>
          <p className="work-locked-title">{item.title}</p>
          {item.details && <p className="work-locked-details">{item.details}</p>}
        </div>
      ) : (
        <div className="form-grid">
          {isAdmin && !isEdit && (
            <div className="form-field is-wide">
              <label htmlFor="work-owner">Assign to</label>
              <select
                id="work-owner"
                className={`input ${errors.owner ? "has-error" : ""}`}
                value={values.owner}
                onChange={(e) => set("owner", e.target.value)}
              >
                <option value="">Choose a digital marketing team member…</option>
                {team.map((u) => (
                  <option key={u._id} value={u._id}>
                    {u.firstName} {u.lastName}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="form-field is-wide">
            <label>Type of work</label>
            <div className="chip-row" role="radiogroup" aria-label="Type of work">
              {WORK_CATEGORIES.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  role="radio"
                  aria-checked={values.category === c.value}
                  className={`chip ${values.category === c.value ? "is-active" : ""}`}
                  onClick={() => set("category", c.value)}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          <div className="form-field is-wide">
            <label htmlFor="work-title">What's the work?</label>
            <input
              id="work-title"
              className={`input ${errors.title ? "has-error" : ""}`}
              value={values.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="e.g. Instagram audit, 3 Diwali banners, Meta ads campaign"
              autoFocus
            />
            {errors.title && <p className="form-error">{errors.title}</p>}
          </div>

          <div className="form-field">
            <label htmlFor="work-client">Client / Brand (optional)</label>
            <input
              id="work-client"
              className="input"
              value={values.client}
              onChange={(e) => set("client", e.target.value)}
              placeholder="e.g. Glow Cosmetics"
            />
          </div>

          <div className="form-field">
            <label htmlFor="work-due">Due date (optional)</label>
            <input
              id="work-due"
              type="date"
              className={`input ${errors.dueDate ? "has-error" : ""}`}
              value={values.dueDate}
              onChange={(e) => set("dueDate", e.target.value)}
            />
          </div>

          <div className="form-field is-wide">
            <label htmlFor="work-details">Details (optional)</label>
            <textarea
              id="work-details"
              className="input lead-notes"
              rows={2}
              value={values.details}
              onChange={(e) => set("details", e.target.value)}
              placeholder="Brief, links, requirements…"
            />
          </div>
        </div>
      )}

      <div className="form-grid">
        <div className="form-field">
          <label htmlFor="work-status">Status</label>
          <select
            id="work-status"
            className={`input ${errors.status ? "has-error" : ""}`}
            value={values.status}
            onChange={(e) => set("status", e.target.value)}
          >
            {statuses.map((s) => (
              <option key={s} value={s}>
                {WORK_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
          {errors.status && <p className="form-error">{errors.status}</p>}
        </div>

        <div className="form-field">
          <label htmlFor="work-note">{isEdit ? "Add an update" : "First note (optional)"}</label>
          <input
            id="work-note"
            className="input"
            value={values.note}
            onChange={(e) => set("note", e.target.value)}
            placeholder={
              values.status === "closed_won"
                ? "What was closed? e.g. Signed 3-month package"
                : values.status === "closed_lost"
                  ? "Why was it lost?"
                  : "What happened? Next step?"
            }
            maxLength={1000}
          />
        </div>
      </div>

      {isEdit && item.updates?.length > 0 && (
        <div className="work-history">
          <p className="work-history-title">History</p>
          <ol>
            {[...item.updates].reverse().map((u, i) => (
              <li key={i}>
                <span className="work-history-dot" />
                <div>
                  <p className="work-history-line">
                    {u.status && <WorkStatusPill status={u.status} />}
                    {u.note && <span>{u.note}</span>}
                  </p>
                  <p className="work-history-meta">
                    {u.by ? `${u.by.firstName} ${u.by.lastName}` : "Someone"} · {formatWhen(u.at)}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="form-actions work-actions">
        {canDelete &&
          (confirmDelete ? (
            <span className="work-delete-confirm">
              Delete for good?
              <button type="button" className="button button-danger" onClick={remove} disabled={saving}>
                Delete
              </button>
              <button type="button" className="button button-secondary" onClick={() => setConfirmDelete(false)}>
                Keep
              </button>
            </span>
          ) : (
            <button type="button" className="work-delete" onClick={() => setConfirmDelete(true)}>
              Delete
            </button>
          ))}
        <button type="button" className="button button-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="button button-primary" disabled={saving}>
          {saving ? "Saving…" : isEdit ? "Save Update" : isAdmin ? "Assign Task" : "Add Work"}
        </button>
      </div>
    </form>
  );
}
