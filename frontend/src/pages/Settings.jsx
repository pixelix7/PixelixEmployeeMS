import { useCallback, useEffect, useState } from "react";
import api, { TOKEN_KEY, getErrorMessage } from "../api/client";
import { useAuth } from "../context/useAuth";
import { ROLE_LABELS } from "../config";
import Modal from "../components/Modal";
import { LockIcon, UserIcon } from "../components/Icons";
import "./Dashboard.css";
import "../components/EmployeeForm.css";
import "./Settings.css";

export default function Settings() {
  const [showPassword, setShowPassword] = useState(false);
  const [toast, setToast] = useState("");
  const closePassword = useCallback(() => setShowPassword(false), []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  return (
    <>
      <header className="page-head">
        <h1>Settings</h1>
        <p>Manage your account and preferences</p>
      </header>

      <ProfileCard />

      <section className="form-card settings-password">
        <div className="settings-password-info">
          <span className="settings-icon">
            <LockIcon />
          </span>
          <div>
            <p className="settings-password-title">Password</p>
            <p className="settings-password-sub">Update your account password</p>
          </div>
        </div>
        <button
          type="button"
          className="button button-secondary"
          onClick={() => setShowPassword(true)}
        >
          Change
        </button>
      </section>

      {showPassword && (
        <ChangePasswordModal
          onClose={closePassword}
          onChanged={() => {
            setShowPassword(false);
            setToast("Password updated");
          }}
        />
      )}

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </>
  );
}

function ProfileCard() {
  const { user, setUser } = useAuth();
  const [values, setValues] = useState({
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone,
  });
  const [errors, setErrors] = useState({});
  const [notice, setNotice] = useState(null); // { type: "success" | "error", text }
  const [saving, setSaving] = useState(false);

  const isDirty =
    values.firstName !== user.firstName ||
    values.lastName !== user.lastName ||
    values.phone !== user.phone;

  const update = (field) => (e) => {
    const value = field === "phone" ? e.target.value.replace(/\D/g, "") : e.target.value;
    setValues((v) => ({ ...v, [field]: value }));
    setErrors((errs) => ({ ...errs, [field]: undefined }));
    setNotice(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    setNotice(null);
    try {
      const { data } = await api.patch("/auth/me", values);
      setUser(data.user); // updates the name in the sidebar too
      setValues({
        firstName: data.user.firstName,
        lastName: data.user.lastName,
        phone: data.user.phone,
      });
      setNotice({ type: "success", text: "Profile updated successfully." });
    } catch (err) {
      const fieldErrors = err.response?.data?.errors;
      if (fieldErrors) setErrors(fieldErrors);
      else setNotice({ type: "error", text: getErrorMessage(err) });
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    setValues({ firstName: user.firstName, lastName: user.lastName, phone: user.phone });
    setErrors({});
    setNotice(null);
  };

  const editable = (name, label, inputProps = {}) => (
    <div className="form-field">
      <label htmlFor={`me-${name}`}>{label}</label>
      <input
        id={`me-${name}`}
        className={`input ${errors[name] ? "has-error" : ""}`}
        value={values[name]}
        onChange={update(name)}
        {...inputProps}
      />
      {errors[name] && <p className="form-error">{errors[name]}</p>}
    </div>
  );

  const readOnly = (label, value) => (
    <div className="form-field">
      <label>{label}</label>
      <input className="input" value={value || "Not provided"} disabled readOnly />
    </div>
  );

  return (
    <form className="form-card settings-profile" onSubmit={handleSubmit} noValidate>
      <h3 className="settings-card-title">
        <UserIcon /> Public Profile
      </h3>

      {notice && (
        <div className={`notice notice-${notice.type} settings-notice`} role="status">
          {notice.text}
        </div>
      )}

      <div className="form-grid">
        {editable("firstName", "First Name", { autoComplete: "given-name" })}
        {editable("lastName", "Last Name", { autoComplete: "family-name" })}
        {editable("phone", "Phone Number", { inputMode: "numeric", maxLength: 10 })}
        {readOnly("Employee ID", user.employeeId)}
        {readOnly("Email", user.email)}
        {readOnly("Role", ROLE_LABELS[user.role])}
        {readOnly("PAN", user.pan)}
        {readOnly("Aadhar", user.aadhar && `XXXX XXXX ${user.aadhar.slice(-4)}`)}
      </div>

      <p className="form-hint settings-readonly-hint">
        Email, role, PAN and Aadhar can only be changed by an admin.
      </p>

      <div className="form-actions">
        <button
          type="button"
          className="button button-secondary"
          onClick={reset}
          disabled={!isDirty || saving}
        >
          Discard
        </button>
        <button type="submit" className="button button-primary" disabled={!isDirty || saving}>
          {saving ? "Saving…" : "Save Changes"}
        </button>
      </div>
    </form>
  );
}

function ChangePasswordModal({ onClose, onChanged }) {
  const { setUser } = useAuth();
  const [values, setValues] = useState({ currentPassword: "", newPassword: "", confirm: "" });
  const [errors, setErrors] = useState({});
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);

  const update = (field) => (e) => {
    setValues((v) => ({ ...v, [field]: e.target.value }));
    setErrors((errs) => ({ ...errs, [field]: undefined }));
    setNotice("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrors({});
    setNotice("");

    if (values.newPassword !== values.confirm) {
      setErrors({ confirm: "Passwords don't match" });
      return;
    }

    setSaving(true);
    try {
      const { data } = await api.patch("/auth/change-password", {
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });
      // The old token stops working after a password change, so keep the new one
      localStorage.setItem(TOKEN_KEY, data.token);
      setUser(data.user);
      onChanged();
    } catch (err) {
      const fieldErrors = err.response?.data?.errors;
      if (fieldErrors?.password) setErrors({ newPassword: fieldErrors.password });
      else setNotice(getErrorMessage(err));
      setSaving(false);
    }
  };

  const field = (name, label, autoComplete) => (
    <div className="form-field">
      <label htmlFor={`pw-${name}`}>{label}</label>
      <input
        id={`pw-${name}`}
        type="password"
        className={`input ${errors[name] ? "has-error" : ""}`}
        value={values[name]}
        onChange={update(name)}
        autoComplete={autoComplete}
        autoFocus={name === "currentPassword"}
      />
      {errors[name] && <p className="form-error">{errors[name]}</p>}
    </div>
  );

  return (
    <Modal title="Change Password" size="sm" onClose={onClose}>
      <form className="settings-pw-form" onSubmit={handleSubmit} noValidate>
        {notice && (
          <div className="notice notice-error" role="alert">
            {notice}
          </div>
        )}
        {field("currentPassword", "Current Password", "current-password")}
        {field("newPassword", "New Password", "new-password")}
        {field("confirm", "Confirm New Password", "new-password")}
        <p className="form-hint settings-pw-hint">
          At least 8 characters. You'll stay signed in here, but other devices will be logged out.
        </p>
        <div className="settings-pw-actions">
          <button type="button" className="button button-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            className="button button-primary"
            disabled={saving || !values.currentPassword || !values.newPassword || !values.confirm}
          >
            {saving ? "Updating…" : "Update Password"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
