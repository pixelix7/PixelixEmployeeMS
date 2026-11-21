import { useState } from "react";
import api, { getErrorMessage } from "../api/client";
import { REPORT_STATUS_LABELS } from "../config";
import { formatDuration, formatLongDay, formatTime, formatWhen, todayKey } from "../utils/format";
import StatusPill from "./StatusPill";
import "./EmployeeForm.css";
import "./LeadForm.css";
import "./AttendanceTable.css";
import "./WorkReportBits.css";

export function ReportStatusPill({ status }) {
  return <span className={`wr-pill wr-${status}`}>{REPORT_STATUS_LABELS[status] || status}</span>;
}

// What the system recorded that day, next to what they wrote
export function DayContext({ day }) {
  if (!day) return null;
  return (
    <div className="wr-context">
      <StatusPill status={day.status} />
      {day.firstIn && (
        <span>
          {formatTime(day.firstIn)} – {day.lastOut ? formatTime(day.lastOut) : "working"}
        </span>
      )}
      <span>
        <strong>{formatDuration(day.workMinutes)}</strong> worked
      </span>
      {day.calls && (
        <span>
          <strong>{day.calls.logged}</strong> calls · {day.calls.added} leads added · {day.calls.converted} converted
        </span>
      )}
      {day.work && (
        <span>
          <strong>{day.work.updates}</strong> work updates · {day.work.closed} closed
        </span>
      )}
    </div>
  );
}

// The written part of a report
export function ReportBody({ report }) {
  return (
    <div className="wr-body">
      <p className="wr-summary">{report.summary}</p>
      {(report.blockers || report.tomorrow) && (
        <div className="wr-extra">
          {report.blockers && (
            <div>
              <span>Blockers</span>
              <p>{report.blockers}</p>
            </div>
          )}
          {report.tomorrow && (
            <div>
              <span>Plan for tomorrow</span>
              <p>{report.tomorrow}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Admin's decision, shown under a reviewed report
export function ReviewNote({ report }) {
  if (report.status === "pending" || !report.reviewedBy) return null;
  return (
    <p className={`wr-review wr-review-${report.status}`}>
      <strong>
        {report.status === "approved" ? "Approved" : "Sent back"} by {report.reviewedBy.firstName}
      </strong>{" "}
      · {formatWhen(report.reviewedAt)}
      {report.reviewNote && <span className="wr-review-note">“{report.reviewNote}”</span>}
    </p>
  );
}

const shiftDay = (key, days) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
};

// Employee: write a new report, or edit / resubmit an existing one
// lockDate: report is for defaultDate only (the "Today" card)
export function ReportForm({ report, defaultDate, earliest, lockDate = false, onSaved, onCancel }) {
  const isEdit = Boolean(report);
  const today = todayKey();
  const [values, setValues] = useState({
    date: report?.date || defaultDate || today,
    summary: report?.summary || "",
    blockers: report?.blockers || "",
    tomorrow: report?.tomorrow || "",
  });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const set = (field, value) => {
    setValues((v) => ({ ...v, [field]: value }));
    setErrors((e) => ({ ...e, [field]: undefined }));
    setFormError("");
  };

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    setFormError("");
    try {
      const { data } = isEdit
        ? await api.patch(`/work-reports/${report._id}`, { summary: values.summary, blockers: values.blockers, tomorrow: values.tomorrow })
        : await api.post("/work-reports", values);
      onSaved(data.message, data.report);
    } catch (err) {
      const fieldErrors = err.response?.data?.errors;
      if (fieldErrors) setErrors(fieldErrors);
      else setFormError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const resubmit = report?.status === "rejected";

  return (
    <form onSubmit={submit} noValidate className="wr-form">
      {formError && (
        <div className="alert" role="alert">
          {formError}
        </div>
      )}
      {resubmit && report.reviewNote && (
        <div className="wr-fix">
          <strong>What to fix:</strong> {report.reviewNote}
        </div>
      )}

      {!isEdit && !lockDate && (
        <div className="form-field wr-date">
          <label htmlFor="wr-date">Day</label>
          <input
            id="wr-date"
            type="date"
            className={`input ${errors.date ? "has-error" : ""}`}
            value={values.date}
            min={earliest || shiftDay(today, -7)}
            max={today}
            onChange={(e) => set("date", e.target.value)}
          />
          {errors.date && <p className="form-error">{errors.date}</p>}
        </div>
      )}

      <div className="form-field">
        <label htmlFor="wr-summary">What did you work on{values.date === today ? " today" : ""}? *</label>
        <textarea
          id="wr-summary"
          className={`input lead-notes ${errors.summary ? "has-error" : ""}`}
          rows={5}
          maxLength={3000}
          value={values.summary}
          onChange={(e) => set("summary", e.target.value)}
          placeholder={"e.g.\n• Called 25 leads from the Instagram list, 3 interested\n• Closed Spice Route on the 3-month plan\n• Updated CRM notes for yesterday's calls"}
          autoFocus
        />
        <p className="form-hint wr-count">{values.summary.length} / 3000</p>
        {errors.summary && <p className="form-error">{errors.summary}</p>}
      </div>
      <div className="form-grid">
        <div className="form-field">
          <label htmlFor="wr-blockers">Blockers (optional)</label>
          <textarea
            id="wr-blockers"
            className={`input lead-notes ${errors.blockers ? "has-error" : ""}`}
            rows={3}
            maxLength={1000}
            value={values.blockers}
            onChange={(e) => set("blockers", e.target.value)}
            placeholder="Anything that slowed you down or needs help"
          />
        </div>
        <div className="form-field">
          <label htmlFor="wr-tomorrow">Plan for tomorrow (optional)</label>
          <textarea
            id="wr-tomorrow"
            className={`input lead-notes ${errors.tomorrow ? "has-error" : ""}`}
            rows={3}
            maxLength={1000}
            value={values.tomorrow}
            onChange={(e) => set("tomorrow", e.target.value)}
            placeholder="What you'll pick up next"
          />
        </div>
      </div>
      <div className="form-actions">
        {onCancel && (
          <button type="button" className="button button-secondary" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button type="submit" className="button button-primary" disabled={saving || values.summary.trim().length < 10}>
          {saving ? "Sending…" : resubmit ? "Resubmit Report" : isEdit ? "Save Changes" : "Submit Report"}
        </button>
      </div>
    </form>
  );
}

// Admin: reject (note required) or approve (note optional)
export function ReviewForm({ report, decision, onDone, onCancel }) {
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const approve = decision === "approved";

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api.patch(`/work-reports/${report._id}/review`, { status: decision, note });
      onDone(`${approve ? "Approved" : "Sent back"}: ${report.user.firstName}'s report for ${formatLongDay(report.date)}`);
    } catch (err) {
      setError(err.response?.data?.errors?.note || getErrorMessage(err));
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit}>
      {error && (
        <div className="alert" role="alert">
          {error}
        </div>
      )}
      <div className="form-field">
        <label htmlFor="wr-note">{approve ? "Note (optional)" : "What should they fix? *"}</label>
        <textarea
          id="wr-note"
          className="input lead-notes"
          rows={3}
          maxLength={500}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={approve ? "e.g. Great work on the conversions!" : "e.g. Please add which clients the banners were for"}
          autoFocus
        />
      </div>
      <p className="form-hint">
        {approve
          ? "Approved reports are locked."
          : "They'll see your note and can edit and resubmit the report."}
      </p>
      <div className="form-actions">
        <button type="button" className="button button-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="submit"
          className={`button ${approve ? "button-primary" : "button-danger"}`}
          disabled={saving || (!approve && !note.trim())}
        >
          {saving ? "Saving…" : approve ? "Approve" : "Send Back"}
        </button>
      </div>
    </form>
  );
}
