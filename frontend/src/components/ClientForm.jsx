import { useEffect, useState } from "react";
import api, { getErrorMessage } from "../api/client";
import { CLIENT_STATUSES, ROLES } from "../config";
import { todayKey } from "../utils/format";
import EmployeePicker from "./EmployeePicker";
import "./EmployeeForm.css";
import "./LeadForm.css";
import "./ClientBits.css";

const FIELDS = {
  name: "",
  contactPerson: "",
  phone: "",
  altPhone: "",
  email: "",
  website: "",
  industry: "",
  city: "",
  address: "",
  gstNumber: "",
  joinedOn: "",
  contractNumber: "",
  contractStart: "",
  contractEnd: "",
  contractValue: "",
  services: "",
  status: "active",
  notes: "",
};

// Admin: add a client or edit one, including who handles it
export default function ClientForm({ client, onSaved, onCancel }) {
  const isEdit = Boolean(client);
  const [values, setValues] = useState(() => {
    const v = { ...FIELDS, joinedOn: todayKey() };
    if (client) for (const k of Object.keys(FIELDS)) v[k] = client[k] ?? "";
    return { ...v, assignedTo: client?.assignedTo?.map((u) => u._id) ?? [] };
  });
  const [team, setTeam] = useState(null);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .get("/users", { params: { status: "active", limit: 100 } })
      .then(({ data }) => {
        const active = data.users.filter((u) => u.role !== ROLES.ADMIN);
        // Keep anyone already assigned who has since been deactivated
        const extra = (client?.assignedTo ?? []).filter((u) => !active.some((a) => a._id === u._id));
        setTeam([...active, ...extra]);
      })
      .catch(() => setTeam([]));
  }, [client]);

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
        ? await api.patch(`/clients/${client._id}`, values)
        : await api.post("/clients", values);
      onSaved(data.client, isEdit ? "Client updated" : data.message);
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

  // Small helper for the many plain inputs
  const field = (name, label, props = {}) => (
    <div className={`form-field ${props.wide ? "is-wide" : ""}`}>
      <label htmlFor={`client-${name}`}>{label}</label>
      <input
        id={`client-${name}`}
        className={`input ${errors[name] ? "has-error" : ""}`}
        value={values[name]}
        onChange={(e) => set(name, e.target.value)}
        type={props.type || "text"}
        placeholder={props.placeholder}
        inputMode={props.inputMode}
        maxLength={props.maxLength}
        min={props.min}
        autoFocus={props.autoFocus}
      />
      {errors[name] && <p className="form-error">{errors[name]}</p>}
    </div>
  );

  return (
    <form onSubmit={submit} noValidate>
      {formError && (
        <div className="alert" role="alert">
          {formError}
        </div>
      )}

      <p className="form-section">Client details</p>
      <div className="form-grid">
        {field("name", "Client / business name *", { placeholder: "e.g. Glow Cosmetics", maxLength: 120, autoFocus: !isEdit, wide: true })}
        {field("contactPerson", "Contact person", { placeholder: "e.g. Priya Mehta", maxLength: 80 })}
        {field("phone", "Phone number *", { placeholder: "98765 43210", inputMode: "tel", maxLength: 20 })}
        {field("altPhone", "Alternate number", { placeholder: "Office / landline", inputMode: "tel", maxLength: 20 })}
        {field("email", "Email", { type: "email", placeholder: "contact@business.com" })}
        {field("website", "Website", { placeholder: "business.com", maxLength: 200, wide: true })}
      </div>

      <p className="form-section">Business</p>
      <div className="form-grid">
        {field("industry", "Industry", { placeholder: "e.g. Beauty, Restaurant, Gym", maxLength: 60 })}
        {field("city", "City", { placeholder: "e.g. Mumbai", maxLength: 60 })}
        {field("address", "Address", { placeholder: "Street, area", maxLength: 300, wide: true })}
        {field("gstNumber", "GSTIN (optional)", { placeholder: "27ABCDE1234F1Z5", maxLength: 15 })}
      </div>

      <p className="form-section">Contract</p>
      <div className="form-grid">
        {field("joinedOn", "Date of joining *", { type: "date" })}
        {field("contractNumber", "Contract number", { placeholder: "e.g. PX-2026-014", maxLength: 50 })}
        {field("contractStart", "Contract start", { type: "date" })}
        {field("contractEnd", "Contract end", { type: "date" })}
        {field("contractValue", "Contract value (₹)", { type: "number", min: 0, placeholder: "e.g. 45000", inputMode: "numeric" })}
        {field("services", "Services", { placeholder: "e.g. Instagram management, Meta ads", maxLength: 300 })}
      </div>

      <p className="form-section">Status & notes</p>
      <div className="form-grid">
        <div className="form-field is-wide">
          <label>Status</label>
          <div className="chip-row" role="radiogroup" aria-label="Status">
            {CLIENT_STATUSES.map((s) => (
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
        </div>
        <div className="form-field is-wide">
          <label htmlFor="client-notes">Notes</label>
          <textarea
            id="client-notes"
            className={`input lead-notes ${errors.notes ? "has-error" : ""}`}
            rows={3}
            maxLength={2000}
            value={values.notes}
            onChange={(e) => set("notes", e.target.value)}
            placeholder="Preferences, special terms, anything the team should know…"
          />
        </div>
      </div>

      <p className="form-section">
        Assign to {values.assignedTo.length > 0 && <span className="task-picked">{values.assignedTo.length} selected</span>}
      </p>
      <EmployeePicker team={team} value={values.assignedTo} onChange={(ids) => set("assignedTo", ids)} />
      <p className="form-hint">Assigned employees can see this client under “Clients”. You can leave it unassigned for now.</p>

      <div className="form-actions">
        <button type="button" className="button button-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="button button-primary" disabled={saving || !values.name.trim() || !values.phone.trim()}>
          {saving ? "Saving…" : isEdit ? "Save Changes" : "Add Client"}
        </button>
      </div>
    </form>
  );
}
