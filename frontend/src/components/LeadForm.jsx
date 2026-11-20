import { useEffect, useRef, useState } from "react";
import api, { getErrorMessage } from "../api/client";
import { CALL_STATUSES, CLOSED_STATUSES, LEAD_SOURCES } from "../config";
import { CheckIcon, PadlockIcon } from "./Icons";
import "./EmployeeForm.css";
import "./LeadForm.css";

// <input type="datetime-local"> wants "YYYY-MM-DDTHH:mm" in local time
const toLocalInput = (date) => {
  if (!date) return "";
  const d = new Date(date);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

// One-tap follow-up times so the form stays fast
const quickTimes = () => {
  const now = new Date();
  const inTwoHours = new Date(now.getTime() + 2 * 3600e3);
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  tomorrow.setHours(11, 0, 0, 0);
  const inThreeDays = new Date(now);
  inThreeDays.setDate(now.getDate() + 3);
  inThreeDays.setHours(11, 0, 0, 0);
  return [
    { label: "In 2 hours", value: inTwoHours },
    { label: "Tomorrow 11 am", value: tomorrow },
    { label: "In 3 days", value: inThreeDays },
  ];
};

const EMPTY = {
  businessName: "",
  phone: "",
  source: "instagram",
  callStatus: "new",
  notes: "",
  followUpAt: "",
};

// Add a lead (no `lead`) or update one. In edit mode the phone is locked.
export default function LeadForm({ lead, onSaved, onCancel }) {
  const isEdit = Boolean(lead);
  const [values, setValues] = useState(() =>
    isEdit
      ? {
          businessName: lead.businessName,
          phone: lead.phone,
          source: lead.source,
          callStatus: lead.callStatus,
          notes: lead.notes || "",
          followUpAt: toLocalInput(lead.followUpAt),
        }
      : EMPTY
  );
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [check, setCheck] = useState(null); // duplicate-check result for the typed phone
  const nameRef = useRef(null);

  const digits = values.phone.replace(/\D/g, "");
  const closed = CLOSED_STATUSES.includes(values.callStatus);

  // Duplicate check: runs as soon as a full number is typed
  useEffect(() => {
    if (isEdit || digits.length < 10) return;
    let cancelled = false;
    const t = setTimeout(() => {
      api
        .get("/leads/check", { params: { phone: digits } })
        .then(({ data }) => !cancelled && setCheck({ ...data, for: digits }))
        .catch(() => !cancelled && setCheck(null));
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [digits, isEdit]);

  // Only trust a result for the number currently in the box
  const currentCheck = check && check.for === digits ? check : null;
  const duplicate = currentCheck?.exists ? currentCheck.lead : null;

  const set = (field, value) => {
    setValues((v) => ({ ...v, [field]: value }));
    if (errors[field]) setErrors((e) => ({ ...e, [field]: undefined }));
    setFormError("");
  };

  const submit = async (e, { addAnother = false } = {}) => {
    e?.preventDefault();
    if (duplicate) return;
    setSaving(true);
    setErrors({});
    setFormError("");

    const payload = {
      businessName: values.businessName,
      source: values.source,
      callStatus: values.callStatus,
      notes: values.notes,
      followUpAt: closed || !values.followUpAt ? null : new Date(values.followUpAt).toISOString(),
    };

    try {
      const { data } = isEdit
        ? await api.patch(`/leads/${lead._id}`, payload)
        : await api.post("/leads", { ...payload, phone: values.phone });
      onSaved(data.lead, isEdit ? "Lead updated" : "Lead added", { addAnother });
      if (addAnother) {
        // Keep the source (usually the same batch), clear everything else
        setValues({ ...EMPTY, source: values.source });
        setCheck(null);
        nameRef.current?.focus();
      }
    } catch (err) {
      const fieldErrors = err.response?.data?.errors;
      if (fieldErrors) setErrors(fieldErrors);
      else setFormError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="lead-form" onSubmit={submit} noValidate>
      {formError && (
        <div className="alert" role="alert">
          {formError}
        </div>
      )}

      <div className="form-grid">
        <div className="form-field">
          <label htmlFor="lead-phone">Phone / WhatsApp Number</label>
          <input
            id="lead-phone"
            className={`input ${errors.phone || duplicate ? "has-error" : ""}`}
            value={values.phone}
            onChange={(e) => set("phone", e.target.value.replace(/[^\d+\s-]/g, ""))}
            inputMode="tel"
            placeholder="98765 43210"
            maxLength={16}
            disabled={isEdit}
            autoFocus={!isEdit}
          />
          {isEdit ? (
            <p className="form-hint lead-lock">
              <PadlockIcon width={12} height={12} /> Locked to {lead.owner?.firstName} {lead.owner?.lastName}
            </p>
          ) : errors.phone ? (
            <p className="form-error">{errors.phone}</p>
          ) : duplicate ? (
            <p className="lead-check is-taken" role="alert">
              <PadlockIcon width={13} height={13} />
              {duplicate.isMine
                ? `You already added this number (${duplicate.businessName})`
                : `Already in the system — locked to ${duplicate.ownerName} (${duplicate.businessName})`}
            </p>
          ) : currentCheck?.valid === false ? (
            <p className="form-error">Enter a valid 10-digit mobile number</p>
          ) : currentCheck?.exists === false ? (
            <p className="lead-check is-free">
              <CheckIcon width={13} height={13} /> New number — it will be locked to you
            </p>
          ) : (
            <p className="form-hint">We check for duplicates as you type.</p>
          )}
        </div>

        <div className="form-field">
          <label htmlFor="lead-name">Business / Brand Name</label>
          <input
            id="lead-name"
            ref={nameRef}
            className={`input ${errors.businessName ? "has-error" : ""}`}
            value={values.businessName}
            onChange={(e) => set("businessName", e.target.value)}
            placeholder="e.g. Glow Cosmetics"
            autoComplete="off"
            autoFocus={isEdit}
          />
          {errors.businessName && <p className="form-error">{errors.businessName}</p>}
        </div>

        <div className="form-field is-wide">
          <label>Source</label>
          <div className="chip-row" role="radiogroup" aria-label="Source">
            {LEAD_SOURCES.map((s) => (
              <button
                key={s.value}
                type="button"
                role="radio"
                aria-checked={values.source === s.value}
                className={`chip ${values.source === s.value ? "is-active" : ""}`}
                onClick={() => set("source", s.value)}
              >
                {s.label}
              </button>
            ))}
          </div>
          {errors.source && <p className="form-error">{errors.source}</p>}
        </div>

        <div className="form-field">
          <label htmlFor="lead-status">Call Status</label>
          <select
            id="lead-status"
            className="input"
            value={values.callStatus}
            onChange={(e) => set("callStatus", e.target.value)}
          >
            {CALL_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        <div className="form-field">
          <label htmlFor="lead-followup">Next Follow-up</label>
          <input
            id="lead-followup"
            type="datetime-local"
            className={`input ${errors.followUpAt ? "has-error" : ""}`}
            value={closed ? "" : values.followUpAt}
            onChange={(e) => set("followUpAt", e.target.value)}
            disabled={closed}
          />
          {closed ? (
            <p className="form-hint">Closed leads don't need follow-ups.</p>
          ) : (
            <div className="quick-times">
              {quickTimes().map((q) => (
                <button
                  key={q.label}
                  type="button"
                  onClick={() => set("followUpAt", toLocalInput(q.value))}
                >
                  {q.label}
                </button>
              ))}
              {values.followUpAt && (
                <button type="button" onClick={() => set("followUpAt", "")}>
                  Clear
                </button>
              )}
            </div>
          )}
        </div>

        <div className="form-field is-wide">
          <label htmlFor="lead-notes">Notes</label>
          <textarea
            id="lead-notes"
            className="input lead-notes"
            value={values.notes}
            onChange={(e) => set("notes", e.target.value)}
            placeholder="What did they say? Budget, products, best time to call…"
            rows={3}
            maxLength={2000}
          />
          {errors.notes && <p className="form-error">{errors.notes}</p>}
        </div>
      </div>

      <div className="form-actions">
        <button type="button" className="button button-secondary" onClick={onCancel}>
          Cancel
        </button>
        {!isEdit && (
          <button
            type="button"
            className="button button-secondary"
            disabled={saving || Boolean(duplicate)}
            onClick={(e) => submit(e, { addAnother: true })}
          >
            Save & Add Another
          </button>
        )}
        <button type="submit" className="button button-primary" disabled={saving || Boolean(duplicate)}>
          {saving ? "Saving…" : isEdit ? "Save Changes" : "Save Lead"}
        </button>
      </div>
    </form>
  );
}
