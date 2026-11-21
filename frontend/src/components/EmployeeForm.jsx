import { useState } from "react";
import api, { getErrorMessage } from "../api/client";
import { ROLES, ROLE_LABELS } from "../config";
import { addMinutes, formatClock, formatSchedule } from "../utils/format";
import useCompanySchedule from "../utils/useCompanySchedule";
import "./EmployeeForm.css";
import "./LeadForm.css"; // chip styles

// Monday-first, with the backend's day numbers (0 = Sunday)
const WEEK = [
  [1, "Mon"],
  [2, "Tue"],
  [3, "Wed"],
  [4, "Thu"],
  [5, "Fri"],
  [6, "Sat"],
  [0, "Sun"],
];

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

  // Work schedule: either the company default, or the employee's own
  const company = useCompanySchedule();
  const current = employee?.schedule;
  const [useCompany, setUseCompany] = useState(!current?.custom);
  const [sched, setSched] = useState(() => ({
    officeStart: current?.officeStart || "",
    officeEnd: current?.officeEnd || "",
    graceMinutes: current?.graceMinutes ?? "",
    workDays: current?.workDays || [],
  }));
  const [isActive, setIsActive] = useState(employee?.isActive !== false);

  // Switching to a custom schedule starts from the company one
  const toggleCompany = (checked) => {
    setUseCompany(checked);
    if (!checked && !sched.officeStart && company) {
      setSched({
        officeStart: company.officeStart,
        officeEnd: company.officeEnd,
        graceMinutes: company.graceMinutes,
        workDays: company.workDays,
      });
    }
  };
  const setSchedField = (field, value) => {
    setSched((v) => ({ ...v, [field]: value }));
    if (errors[field]) setErrors((errs) => ({ ...errs, [field]: undefined }));
  };
  const toggleDay = (day) =>
    setSchedField(
      "workDays",
      sched.workDays.includes(day) ? sched.workDays.filter((d) => d !== day) : [...sched.workDays, day]
    );

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

    if (!useCompany && sched.workDays.length === 0) {
      setErrors({ workDays: "Pick at least one working day" });
      setSaving(false);
      return;
    }
    // Empty values = "use the company schedule"
    Object.assign(
      profile,
      useCompany
        ? { officeStart: null, officeEnd: null, graceMinutes: null, workDays: [] }
        : {
            officeStart: sched.officeStart || null,
            officeEnd: sched.officeEnd || null,
            graceMinutes: sched.graceMinutes === "" ? null : Number(sched.graceMinutes),
            workDays: sched.workDays,
          }
    );
    if (isEdit && !isSelf) profile.isActive = isActive;

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
        <h3>
          Personal Information
          <span className="emp-form-id">
            {isEdit && employee.employeeId ? `Employee ID ${employee.employeeId}` : "Employee ID is generated automatically"}
          </span>
        </h3>
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

      {values.role !== ROLES.ADMIN && (
        <section className="form-card">
          <h3>Work Schedule</h3>
          <label className="sched-toggle">
            <input type="checkbox" checked={useCompany} onChange={(e) => toggleCompany(e.target.checked)} />
            <span>
              <strong>Use company schedule</strong>
              <small>{company ? formatSchedule({ ...company }) : "Loading…"}</small>
            </span>
          </label>

          {!useCompany && (
            <div className="form-grid sched-grid">
              <div className="form-field">
                <label htmlFor="emp-officeStart">Office start</label>
                <input
                  id="emp-officeStart"
                  type="time"
                  className={`input ${errors.officeStart ? "has-error" : ""}`}
                  value={sched.officeStart}
                  onChange={(e) => setSchedField("officeStart", e.target.value)}
                />
                {errors.officeStart && <p className="form-error">{errors.officeStart}</p>}
              </div>
              <div className="form-field">
                <label htmlFor="emp-officeEnd">Office end</label>
                <input
                  id="emp-officeEnd"
                  type="time"
                  className={`input ${errors.officeEnd ? "has-error" : ""}`}
                  value={sched.officeEnd}
                  onChange={(e) => setSchedField("officeEnd", e.target.value)}
                />
                {errors.officeEnd && <p className="form-error">{errors.officeEnd}</p>}
              </div>
              <div className="form-field">
                <label htmlFor="emp-grace">Late rule — grace period (minutes)</label>
                <input
                  id="emp-grace"
                  type="number"
                  min={0}
                  max={240}
                  className={`input ${errors.graceMinutes ? "has-error" : ""}`}
                  value={sched.graceMinutes}
                  onChange={(e) => setSchedField("graceMinutes", e.target.value)}
                />
                {errors.graceMinutes ? (
                  <p className="form-error">{errors.graceMinutes}</p>
                ) : (
                  sched.officeStart && (
                    <p className="form-hint">
                      Clock-ins after <strong>{formatClock(addMinutes(sched.officeStart, sched.graceMinutes))}</strong>{" "}
                      count as late
                    </p>
                  )
                )}
              </div>
              <div className="form-field is-wide">
                <label>Working days</label>
                <div className="chip-row" role="group" aria-label="Working days">
                  {WEEK.map(([day, label]) => (
                    <button
                      key={day}
                      type="button"
                      aria-pressed={sched.workDays.includes(day)}
                      className={`chip ${sched.workDays.includes(day) ? "is-active" : ""}`}
                      onClick={() => toggleDay(day)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {errors.workDays ? (
                  <p className="form-error">{errors.workDays}</p>
                ) : (
                  <p className="form-hint">Days not ticked are off days — never counted as absent.</p>
                )}
              </div>
            </div>
          )}
        </section>
      )}

      {isEdit && (
        <section className="form-card">
          <h3>Account Status</h3>
          <label className={`status-switch ${isSelf ? "is-disabled" : ""}`}>
            <input
              type="checkbox"
              role="switch"
              checked={isActive}
              disabled={isSelf}
              onChange={(e) => setIsActive(e.target.checked)}
            />
            <span className="status-track" aria-hidden />
            <span>
              <strong>{isActive ? "Active" : "Deactivated"}</strong>
              <small>
                {isSelf
                  ? "You can't deactivate your own account."
                  : isActive
                    ? "Can log in and is counted in attendance."
                    : "Can't log in. Kept in past reports; not counted after today."}
              </small>
            </span>
          </label>
        </section>
      )}

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
