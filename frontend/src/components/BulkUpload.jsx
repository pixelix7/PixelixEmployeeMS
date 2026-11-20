import { useRef, useState } from "react";
import api, { getErrorMessage } from "../api/client";
import { ROLE_LABELS } from "../config";
import { downloadCsv, parseCsv } from "../utils/csv";
import { BULK_LIMIT, TEMPLATE_ROWS, readUserRows } from "../utils/bulkUsers";
import { CheckIcon } from "./Icons";
import "./BulkUpload.css";

const FIELD_LABELS = {
  firstName: "First name",
  lastName: "Last name",
  phone: "Phone",
  email: "Email",
  role: "Role",
  pan: "PAN",
  aadhar: "Aadhar",
  password: "Password",
};

const errorList = (errors) =>
  Object.entries(errors).map(([field, msg]) => (
    <li key={field}>
      <strong>{FIELD_LABELS[field] || field}:</strong> {msg}
    </li>
  ));

// Upload a CSV of employees. Steps: pick file -> check preview -> create -> results.
export default function BulkUpload({ onDone, onCancel }) {
  const [file, setFile] = useState(null); // { name, rows, missing, unknown }
  const [readError, setReadError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [report, setReport] = useState(null);
  const inputRef = useRef(null);

  const readFile = (f) => {
    setReadError("");
    setFile(null);
    if (!f) return;
    if (!/\.csv$/i.test(f.name)) {
      setReadError("Please choose a .csv file. In Excel use File → Save As → CSV (Comma delimited).");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = readUserRows(parseCsv(String(reader.result)));
      if (parsed.rows.length === 0) {
        setReadError("No employee rows found in this file.");
        return;
      }
      setFile({ name: f.name, ...parsed });
    };
    reader.onerror = () => setReadError("Couldn't read that file.");
    reader.readAsText(f);
  };

  const valid = file?.rows.filter((r) => Object.keys(r.errors).length === 0) ?? [];
  const invalid = file?.rows.filter((r) => Object.keys(r.errors).length > 0) ?? [];
  const tooMany = valid.length > BULK_LIMIT;
  const canUpload = file && !file.missing.length && valid.length > 0 && !tooMany;

  const upload = async () => {
    setUploading(true);
    setUploadError("");
    try {
      const users = valid.map((r) => ({ row: r.row, ...r.data }));
      const { data } = await api.post("/users/bulk", { users });
      setReport({ ...data, skipped: invalid });
    } catch (err) {
      setUploadError(getErrorMessage(err));
    } finally {
      setUploading(false);
    }
  };

  const downloadCredentials = () => {
    const rows = report.results
      .filter((r) => r.ok && r.generatedPassword)
      .map((r) => [
        r.user.firstName,
        r.user.lastName,
        r.user.email,
        ROLE_LABELS[r.user.role],
        r.generatedPassword,
      ]);
    downloadCsv("new-employee-logins.csv", [
      ["First name", "Last name", "Email (login)", "Role", "Temporary password"],
      ...rows,
    ]);
  };

  /* ---------- Step 3: results ---------- */
  if (report) {
    const failed = [
      ...report.results.filter((r) => !r.ok),
      ...report.skipped.map((r) => ({ row: r.row, email: r.data.email, errors: r.errors })),
    ].sort((a, b) => a.row - b.row);
    const withPasswords = report.results.filter((r) => r.ok && r.generatedPassword).length;

    return (
      <div className="bulk">
        <div className="bulk-summary">
          <div className="bulk-stat is-good">
            <strong>{report.created}</strong> created
          </div>
          <div className={`bulk-stat ${failed.length ? "is-bad" : ""}`}>
            <strong>{failed.length}</strong> not created
          </div>
        </div>

        {withPasswords > 0 && (
          <div className="notice notice-success bulk-creds">
            <div>
              <p>
                <strong>{withPasswords}</strong> employee{withPasswords === 1 ? "" : "s"} got an
                auto-generated password. Download the login details now — they won't be shown again.
              </p>
              <button type="button" className="button button-primary" onClick={downloadCredentials}>
                Download login details (CSV)
              </button>
            </div>
          </div>
        )}

        {failed.length > 0 && (
          <div className="panel">
            <div className="panel-head">
              <h2>Rows not created</h2>
            </div>
            <ul className="bulk-errors">
              {failed.map((r) => (
                <li key={r.row}>
                  <span className="bulk-row">Row {r.row}</span>
                  <div>
                    {r.email && <p className="bulk-email">{r.email}</p>}
                    <ul>{errorList(r.errors)}</ul>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="form-actions">
          <button type="button" className="button button-primary" onClick={() => onDone(report.created)}>
            Done
          </button>
        </div>
      </div>
    );
  }

  /* ---------- Steps 1 & 2: pick a file, preview ---------- */
  return (
    <div className="bulk">
      <ol className="bulk-steps">
        <li>
          <span className="bulk-step-num">1</span>
          <div>
            <p className="bulk-step-title">Download the sample CSV</p>
            <p className="bulk-step-text">
              One employee per row. <code>role</code> is <code>telecaller</code>,{" "}
              <code>digital_marketing</code> or <code>admin</code> (blank = telecaller). PAN, Aadhar
              and password are optional — leave password blank and we'll create a secure one.
            </p>
            <button
              type="button"
              className="button button-secondary"
              onClick={() => downloadCsv("employees-template.csv", TEMPLATE_ROWS)}
            >
              Download sample CSV
            </button>
            <p className="form-hint bulk-tip">
              Tip for Excel: format the Phone and Aadhar columns as <em>Text</em> before typing, or
              Excel turns long numbers into “1.23E+11”. Replace the two example rows with your own.
            </p>
          </div>
        </li>
        <li>
          <span className="bulk-step-num">2</span>
          <div>
            <p className="bulk-step-title">Upload the filled file</p>
            <div
              className={`bulk-drop ${dragging ? "is-dragging" : ""}`}
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                readFile(e.dataTransfer.files?.[0]);
              }}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
            >
              <input
                ref={inputRef}
                type="file"
                accept=".csv,text/csv"
                hidden
                onChange={(e) => {
                  readFile(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
              {file ? (
                <>
                  <strong>{file.name}</strong>
                  <span>Click to choose a different file</span>
                </>
              ) : (
                <>
                  <strong>Drop your CSV here or click to browse</strong>
                  <span>Up to {BULK_LIMIT} employees per file</span>
                </>
              )}
            </div>
            {readError && <div className="alert bulk-alert">{readError}</div>}
          </div>
        </li>
      </ol>

      {file && (
        <>
          {file.missing.length > 0 && (
            <div className="alert bulk-alert">
              Missing column{file.missing.length > 1 ? "s" : ""}:{" "}
              {file.missing.map((f) => FIELD_LABELS[f]).join(", ")}. Use the sample CSV's headers.
            </div>
          )}
          {file.unknown.length > 0 && (
            <p className="form-hint">Ignored column{file.unknown.length > 1 ? "s" : ""}: {file.unknown.join(", ")}</p>
          )}

          <div className="bulk-summary">
            <div className="bulk-stat is-good">
              <strong>{valid.length}</strong> ready
            </div>
            <div className={`bulk-stat ${invalid.length ? "is-bad" : ""}`}>
              <strong>{invalid.length}</strong> with errors (will be skipped)
            </div>
          </div>
          {tooMany && (
            <div className="alert bulk-alert">
              That's {valid.length} employees — the limit is {BULK_LIMIT} per upload. Split the file and upload in parts.
            </div>
          )}

          <div className="panel bulk-preview">
            <div className="att-table-wrap">
              <table className="att-table">
                <thead>
                  <tr>
                    <th>Row</th>
                    <th>Employee</th>
                    <th className="bulk-hide-sm">Phone</th>
                    <th className="bulk-hide-sm">Role</th>
                    <th>Check</th>
                  </tr>
                </thead>
                <tbody>
                  {file.rows.map((r) => {
                    const hasErrors = Object.keys(r.errors).length > 0;
                    return (
                      <tr key={r.row} className={hasErrors ? "is-bad" : ""}>
                        <td className="att-muted">{r.row}</td>
                        <td>
                          <p className="bulk-name">
                            {r.data.firstName} {r.data.lastName}
                          </p>
                          <p className="bulk-email-sm">{r.data.email}</p>
                        </td>
                        <td className="bulk-hide-sm">{r.data.phone}</td>
                        <td className="bulk-hide-sm">{ROLE_LABELS[r.data.role] || "—"}</td>
                        <td className="bulk-check">
                          {hasErrors ? (
                            <ul>{errorList(r.errors)}</ul>
                          ) : (
                            <span className="bulk-ok">
                              <CheckIcon width={13} height={13} /> Ready
                              {r.data.role === "admin" && <em> · full admin access</em>}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {uploadError && <div className="alert bulk-alert">{uploadError}</div>}

      <div className="form-actions">
        <button type="button" className="button button-secondary" onClick={onCancel} disabled={uploading}>
          Cancel
        </button>
        <button type="button" className="button button-primary" onClick={upload} disabled={!canUpload || uploading}>
          {uploading
            ? `Creating ${valid.length} employee${valid.length === 1 ? "" : "s"}…`
            : `Create ${valid.length || ""} employee${valid.length === 1 ? "" : "s"}`}
        </button>
      </div>
      {uploading && valid.length > 10 && (
        <p className="form-hint bulk-wait">This can take up to a minute for large files — keep this window open.</p>
      )}
    </div>
  );
}
