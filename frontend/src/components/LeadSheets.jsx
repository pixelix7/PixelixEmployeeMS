import { useEffect, useState } from "react";
import api, { getErrorMessage } from "../api/client";
import { formatWhen } from "../utils/format";
import { saveFile } from "../utils/saveFile";
import { DownloadIcon, TrashIcon, UploadIcon } from "./Icons";
import "./EmployeeForm.css";
import "./LeadForm.css";
import "./LeadSheets.css";

const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPT = ".xlsx,.xls,.csv";

// 10304 -> "10 KB"
const formatBytes = (n) =>
  n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;

// Errors on blob requests come back as a Blob too; read the JSON message out of it
const blobError = async (err) => {
  if (err.response?.data instanceof Blob) {
    try {
      return JSON.parse(await err.response.data.text()).message || getErrorMessage(err);
    } catch {
      /* fall through */
    }
  }
  return getErrorMessage(err);
};

// Download a sheet: browser download on the web, share sheet in the Android app
async function downloadSheet(sheet) {
  const res = await api.get(`/lead-sheets/${sheet._id}/download`, { responseType: "blob" });
  await saveFile(res.data, sheet.fileName);
}

/* ---------------- Admin: assign a sheet ---------------- */

export function AssignSheetForm({ onSaved, onCancel }) {
  const [telecallers, setTelecallers] = useState(null);
  const [assignedTo, setAssignedTo] = useState("");
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .get("/users", { params: { role: "telecaller", status: "active", limit: 100 } })
      .then(({ data }) => setTelecallers(data.users))
      .catch(() => setTelecallers([]));
  }, []);

  const pick = (e) => {
    const f = e.target.files?.[0] || null;
    setError("");
    if (f && f.size > MAX_BYTES) {
      setError("That file is larger than 5 MB.");
      e.target.value = "";
      setFile(null);
      return;
    }
    setFile(f);
    // Suggest a title from the file name (if the admin hasn't typed one)
    if (f && !title.trim()) setTitle(f.name.replace(/\.[^.]+$/, ""));
  };

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const { data } = await api.post("/lead-sheets", file, {
        params: { assignedTo, title, note, fileName: file.name },
        headers: { "Content-Type": "application/octet-stream" },
      });
      onSaved(data.message);
    } catch (err) {
      const fe = err.response?.data?.errors;
      setError(fe ? Object.values(fe)[0] : getErrorMessage(err));
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate>
      {error && (
        <div className="alert" role="alert">
          {error}
        </div>
      )}
      <div className="form-grid">
        <div className="form-field is-wide">
          <label htmlFor="sheet-to">Assign to telecaller *</label>
          <select id="sheet-to" className="input" value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
            <option value="">{telecallers ? "Choose a telecaller…" : "Loading…"}</option>
            {(telecallers ?? []).map((u) => (
              <option key={u._id} value={u._id}>
                {u.firstName} {u.lastName}
                {u.employeeId ? ` · ${u.employeeId}` : ""}
              </option>
            ))}
          </select>
          {telecallers?.length === 0 && <p className="form-hint">No active telecallers yet.</p>}
        </div>

        <div className="form-field is-wide">
          <label htmlFor="sheet-file">Excel / CSV file *</label>
          <label className={`sheet-drop ${file ? "has-file" : ""}`} htmlFor="sheet-file">
            <UploadIcon width={20} height={20} />
            <span>
              {file ? (
                <>
                  <strong>{file.name}</strong>
                  <small>{formatBytes(file.size)} · tap to change</small>
                </>
              ) : (
                <>
                  <strong>Choose a file</strong>
                  <small>.xlsx, .xls or .csv · up to 5 MB</small>
                </>
              )}
            </span>
          </label>
          <input id="sheet-file" type="file" accept={ACCEPT} className="sheet-file-input" onChange={pick} />
        </div>

        <div className="form-field is-wide">
          <label htmlFor="sheet-title">Title</label>
          <input
            id="sheet-title"
            className="input"
            value={title}
            maxLength={120}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Mumbai salons — November"
          />
        </div>
        <div className="form-field is-wide">
          <label htmlFor="sheet-note">Note for the telecaller (optional)</label>
          <textarea
            id="sheet-note"
            className="input lead-notes"
            rows={2}
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Call all of these before Friday, focus on Bandra first"
          />
        </div>
      </div>
      <p className="form-hint">The telecaller gets the file exactly as uploaded and can download it on the web or in the app.</p>
      <div className="form-actions">
        <button type="button" className="button button-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="button button-primary" disabled={saving || !assignedTo || !file}>
          <UploadIcon width={16} height={16} /> {saving ? "Uploading…" : "Assign Sheet"}
        </button>
      </div>
    </form>
  );
}

/* ---------------- List (admin: all sheets, telecaller: theirs) ---------------- */

export function LeadSheetsPanel({ isAdmin, reloadKey = 0, onToast }) {
  const [result, setResult] = useState({ key: null, data: null, error: "" });
  const [reload, setReload] = useState(0);
  const [busyId, setBusyId] = useState(null);
  const [confirmId, setConfirmId] = useState(null);
  const key = `${reloadKey}|${reload}`;

  useEffect(() => {
    let cancelled = false;
    api
      .get("/lead-sheets")
      .then(({ data }) => !cancelled && setResult({ key, data, error: "" }))
      .catch((err) => !cancelled && setResult({ key, data: null, error: getErrorMessage(err) }));
    return () => {
      cancelled = true;
    };
  }, [key]);

  const download = async (sheet) => {
    setBusyId(sheet._id);
    try {
      await downloadSheet(sheet);
      if (!isAdmin) setReload((r) => r + 1); // clears the "New" badge
    } catch (err) {
      onToast?.(await blobError(err));
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (sheet) => {
    try {
      await api.delete(`/lead-sheets/${sheet._id}`);
      setConfirmId(null);
      onToast?.("Sheet removed");
      setReload((r) => r + 1);
    } catch (err) {
      onToast?.(getErrorMessage(err));
    }
  };

  const { data, error } = result;
  const sheets = data?.sheets ?? [];
  // Telecallers only see this panel once they have a sheet
  if (!isAdmin && (!data || sheets.length === 0)) return null;

  return (
    <section className="panel sheet-panel">
      <div className="panel-head">
        <h2>
          {isAdmin ? "Assigned Excel sheets" : "Lead sheets from admin"}
          {!isAdmin && data?.unread > 0 && <span className="sheet-count">{data.unread} new</span>}
          {isAdmin && data && <span className="att-meta"> · {sheets.length}</span>}
        </h2>
      </div>
      {error && <p className="panel-empty">{error}</p>}
      {data && sheets.length === 0 ? (
        <p className="panel-empty">No sheets assigned yet. Use “Assign Excel Sheet” to send one to a telecaller.</p>
      ) : (
        <ul className="sheet-list">
          {sheets.map((s) => {
            const isNew = !s.firstDownloadedAt;
            return (
              <li key={s._id} className={`sheet-item ${!isAdmin && isNew ? "is-new" : ""}`}>
                <span className={`sheet-ext sheet-ext-${s.extension}`}>{s.extension.toUpperCase()}</span>
                <div className="sheet-main">
                  <p className="sheet-title">
                    {s.title}
                    {!isAdmin && isNew && <span className="sheet-new">New</span>}
                  </p>
                  <p className="sheet-meta">
                    {s.fileName} · {formatBytes(s.size)} · {formatWhen(s.createdAt)}
                    {isAdmin && s.assignedTo && (
                      <>
                        {" "}
                        · <strong>
                          {s.assignedTo.firstName} {s.assignedTo.lastName}
                        </strong>
                        {s.assignedTo.employeeId && ` (${s.assignedTo.employeeId})`}
                      </>
                    )}
                    {!isAdmin && s.uploadedBy && ` · from ${s.uploadedBy.firstName}`}
                  </p>
                  {s.note && <p className="sheet-note">“{s.note}”</p>}
                  {isAdmin && (
                    <p className={`sheet-status ${isNew ? "is-pending" : "is-done"}`}>
                      {isNew
                        ? "Not downloaded yet"
                        : `Downloaded ${s.downloadCount} time${s.downloadCount === 1 ? "" : "s"} · last ${formatWhen(s.lastDownloadedAt)}`}
                    </p>
                  )}
                </div>
                <div className="sheet-actions">
                  {confirmId === s._id ? (
                    <span className="sheet-confirm">
                      Remove?
                      <button type="button" className="button button-danger" onClick={() => remove(s)}>
                        Remove
                      </button>
                      <button type="button" className="button button-secondary" onClick={() => setConfirmId(null)}>
                        Keep
                      </button>
                    </span>
                  ) : (
                    <>
                      <button
                        type="button"
                        className={`button ${!isAdmin && isNew ? "button-primary" : "button-secondary"} sheet-download`}
                        onClick={() => download(s)}
                        disabled={busyId === s._id}
                      >
                        <DownloadIcon width={16} height={16} /> {busyId === s._id ? "Downloading…" : "Download"}
                      </button>
                      {isAdmin && (
                        <button
                          type="button"
                          className="sheet-delete"
                          onClick={() => setConfirmId(s._id)}
                          aria-label={`Remove ${s.title}`}
                          title="Remove sheet"
                        >
                          <TrashIcon width={16} height={16} />
                        </button>
                      )}
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
