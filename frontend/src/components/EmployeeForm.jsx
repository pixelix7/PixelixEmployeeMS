import { useState } from "react";
import api, { getErrorMessage } from "../api/client";
import { ROLES, ROLE_LABELS } from "../config";
import "./EmployeeForm.css";

const EMPTY = {
  firstName: "",
  lastName: "",
  phone: "",
  email: "",
  pan: "",
  aadhar: "",
  role: ROLES.TELECALLER,
  password: "",
};

// Add or edit a user. Pass `employee` to edit; leave it out to create.
// `isSelf` locks the role so admins can't accidentally demote themselves.
export default function EmployeeForm({ employee, isSelf = false, onSaved, onCancel }) {
  const isEdit = Boolean(employee);
  const [values, setValues] = useState(() =>
    isEdit
      ? {
          ...EMPTY,
          ...Object.fromEntries(Object.keys(EMPTY).map((k) => [k, employee[k] ?? ""])),
          password: "",
        }
      : EMPTY
  );
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const update = (field) => (e) => {
    let value = e.target.value;
    if (field === "pan") value = value.toUpperCase();
    if (field === "phone" || field === "aadhar") value = value.replace(/\D/g, "");
    setValues((v) => ({ ...v, [field]: value }));
    if (errors[field]) setErrors((errs) => ({ ...errs, [field]: undefined }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrors({});
    setFormError("");
    setSaving(true);

    const { password, ...profile } = values;
    // Admins change their own password from Settings, not here
    // (resetting it here would log them out of this session)
    if (isSelf) delete profile.role;

    try {
      let saved;
      if (isEdit) {
        const { data } = await api.patch(`/users/${employee._id}`, profile);
        saved = data.user;
        if (password) {
          await api.patch(`/users/${employee._id}/password`, { newPassword: password });
        }
      } else {
        const { data } = await api.post("/auth/register", { ...profile, password });
        saved = data.user;
      }
      onSaved(saved, isEdit ? "Employee updated" : "Employee added");
    } catch (err) {
      const fieldErrors = err.response?.data?.errors;
      if (fieldErrors) setErrors(fieldErrors);
      else setFormError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const field = (name, label, props = {}) => (
    <div className={`form-field ${props.wide ? "is-wide" : ""}`}>
      <label htmlFor={`emp-${name}`}>{label}</label>
      <input
        id={`emp-${name}`}
        className={`input ${errors[name] ? "has-error" : ""}`}
        value={values[name]}
        onChange={update(name)}
        {...props.input}
      />
      {errors[name] ? (
        <p className="form-error">{errors[name]}</p>
      ) : (
        props.hint && <p className="form-hint">{props.hint}</p>
      )}
    </div>
  );

  return (
    <form className="emp-form" onSubmit={handleSubmit} noValidate>
      {formError && (
        <div className="alert" role="alert">
          {formError}
        </div>
      )}

      <section className="form-card">
        <h3>Personal Information</h3>
        <div className="form-grid">
          {field("firstName", "First Name", { input: { autoComplete: "off", autoFocus: true } })}
          {field("lastName", "Last Name", { input: { autoComplete: "off" } })}
          {field("phone", "Phone Number", {
            input: { inputMode: "numeric", maxLength: 10, placeholder: "10-digit mobile" },
          })}
          {field("email", "Work Email", {
            input: { type: "email", autoComplete: "off", placeholder: "name@company.com" },
          })}
        </div>
      </section>

      <section className="form-card">
        <h3>Identity Documents</h3>
        <div className="form-grid">
          {field("pan", "PAN (Optional)", {
            input: { maxLength: 10, placeholder: "ABCDE1234F" },
          })}
          {field("aadhar", "Aadhar (Optional)", {
            input: { inputMode: "numeric", maxLength: 12, placeholder: "12-digit number" },
          })}
        </div>
      </section>

      <section className="form-card">
        <h3>Account Setup</h3>
        <div className="form-grid">
          <div className="form-field">
            <label htmlFor="emp-role">System Role</label>
            <select
              id="emp-role"
              className={`input ${errors.role ? "has-error" : ""}`}
              value={values.role}
              onChange={update("role")}
              disabled={isSelf}
            >
              {Object.values(ROLES).map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABELS[role]}
                </option>
              ))}
            </select>
            {errors.role ? (
              <p className="form-error">{errors.role}</p>
            ) : (
              isSelf && <p className="form-hint">You can't change your own role.</p>
            )}
          </div>
          {isSelf ? (
            <div className="form-field">
              <label>Password</label>
              <p className="form-hint form-hint-box">
                Change your own password from Settings.
              </p>
            </div>
          ) : (
            field("password", isEdit ? "Reset Password (Optional)" : "Temporary Password", {
              input: {
                type: "password",
                autoComplete: "new-password",
                placeholder: isEdit ? "Leave blank to keep current" : "At least 8 characters",
              },
              hint: isEdit ? "Setting this logs the user out everywhere." : undefined,
            })
          )}
        </div>
      </section>

      <div className="form-actions">
        <button type="button" className="button button-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="button button-primary" disabled={saving}>
          {saving ? "Saving…" : isEdit ? "Save Changes" : "Create Employee"}
        </button>
      </div>
    </form>
  );
}
