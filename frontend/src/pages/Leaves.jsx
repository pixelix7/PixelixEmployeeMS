import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api, { getErrorMessage } from "../api/client";
import { useAuth } from "../context/useAuth";
import { LEAVE_STATUS_LABELS, LEAVE_TYPES, LEAVE_TYPE_LABELS, ROLES, ROLE_LABELS } from "../config";
import { formatDay, formatWhen, todayKey } from "../utils/format";
import Modal from "../components/Modal";
import { CheckIcon, CloseIcon, PlusIcon } from "../components/Icons";
import "../components/EmployeeForm.css";
import "../components/LeadForm.css";
import "../components/AttendanceTable.css";
import "./Attendance.css";
import "./Leaves.css";

// "Mon, 23 Nov" or "Mon, 23 Nov – Wed, 25 Nov"
const formatRange = (l) => (l.from === l.to ? formatDay(l.from) : `${formatDay(l.from)} – ${formatDay(l.to)}`);
const formatDays = (l) => (l.halfDay ? "Half day" : `${l.days} day${l.days === 1 ? "" : "s"}`);

function LeaveStatus({ status }) {
  return <span className={`leave-status leave-${status}`}>{LEAVE_STATUS_LABELS[status] || status}</span>;
}

// Fetch `url` and keep the result keyed by it, so "loading" is derived (no setState in the effect body)
function useFetch(url) {
  const [result, setResult] = useState({ url: null, data: null, error: "" });
  useEffect(() => {
    let cancelled = false;
    api
      .get(url)
      .then(({ data }) => !cancelled && setResult({ url, data, error: "" }))
      .catch((err) => !cancelled && setResult({ url, data: null, error: getErrorMessage(err) }));
    return () => {
      cancelled = true;
    };
  }, [url]);
  return { ...result, loading: result.url !== url };
}

export default function Leaves() {
  const { user } = useAuth();
  return user.role === ROLES.ADMIN ? <LeaveRequests /> : <MyLeaves />;
}

/* ================= Staff: apply, track, cancel ================= */

function MyLeaves() {
  const [reload, setReload] = useState(0);
  const { data, error, loading } = useFetch(`/leaves/me?r=${reload}`);
  const [applying, setApplying] = useState(false);
  const [notice, setNotice] = useState("");
  const [cancelId, setCancelId] = useState(null);
  const [actionError, setActionError] = useState("");

  const cancel = async (id) => {
    setActionError("");
    try {
      await api.patch(`/leaves/${id}/cancel`);
      setCancelId(null);
      setNotice("Leave request cancelled");
      setReload((r) => r + 1);
    } catch (err) {
      setActionError(getErrorMessage(err));
    }
  };

  const used = data?.usedThisYear;
  const totalUsed = used ? Object.values(used).reduce((a, b) => a + b, 0) : 0;

  return (
    <>
      <header className="att-head">
        <div className="page-head">
          <h1>Leave</h1>
          <p>Apply for leave and track your requests</p>
        </div>
        <button type="button" className="button button-primary" onClick={() => setApplying(true)}>
          <PlusIcon /> Apply for Leave
        </button>
      </header>

      {notice && <div className="notice notice-success leave-notice">{notice}</div>}
      {(error || actionError) && <div className="alert leave-notice">{error || actionError}</div>}

      {data && (
        <div className="att-chips leave-chips">
          <span>
            <strong>{totalUsed}</strong> day{totalUsed === 1 ? "" : "s"} taken in {todayKey().slice(0, 4)}
          </span>
          {LEAVE_TYPES.filter((t) => used[t.value] > 0).map((t) => (
            <span key={t.value}>
              <strong>{used[t.value]}</strong> {t.label.toLowerCase()}
            </span>
          ))}
          <span>
            <strong>{data.pending}</strong> pending
          </span>
        </div>
      )}

      <section className={`panel ${loading && data ? "is-refreshing" : ""}`}>
        <div className="panel-head">
          <h2>My requests</h2>
        </div>
        {!data ? (
          <p className="panel-empty">{error ? "" : "Loading…"}</p>
        ) : data.leaves.length === 0 ? (
          <p className="panel-empty">No leave requests yet. Use “Apply for Leave” when you need time off.</p>
        ) : (
          <ul className="leave-list">
            {data.leaves.map((l) => (
              <li key={l._id} className="leave-item">
                <div className="leave-main">
                  <p className="leave-title">
                    <span className={`leave-type leave-type-${l.type}`}>{LEAVE_TYPE_LABELS[l.type]}</span>
                    <strong>{formatRange(l)}</strong>
                    <span className="att-muted">· {formatDays(l)}</span>
                  </p>
                  <p className="leave-reason">{l.reason}</p>
                  {l.reviewedBy && (
                    <p className="leave-review">
                      {LEAVE_STATUS_LABELS[l.status]} by {l.reviewedBy.firstName} {l.reviewedBy.lastName}
                      {l.reviewedAt && ` · ${formatWhen(l.reviewedAt)}`}
                      {l.reviewNote && <> — “{l.reviewNote}”</>}
                    </p>
                  )}
                </div>
                <div className="leave-side">
                  <LeaveStatus status={l.status} />
                  {l.status === "pending" &&
                    (cancelId === l._id ? (
                      <span className="hol-confirm">
                        Cancel request?
                        <button type="button" className="button button-danger" onClick={() => cancel(l._id)}>
                          Yes
                        </button>
                        <button type="button" className="button button-secondary" onClick={() => setCancelId(null)}>
                          No
                        </button>
                      </span>
                    ) : (
                      <button type="button" className="leave-link" onClick={() => setCancelId(l._id)}>
                        Cancel
                      </button>
                    ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {applying && (
        <Modal title="Apply for Leave" subtitle="Your admin will approve or reject it" size="md" onClose={() => setApplying(false)}>
          <LeaveForm
            onCancel={() => setApplying(false)}
            onSaved={(message) => {
              setApplying(false);
              setNotice(message);
              setReload((r) => r + 1);
            }}
          />
        </Modal>
      )}
    </>
  );
}

function LeaveForm({ onSaved, onCancel }) {
  const today = todayKey();
  const [values, setValues] = useState({ type: "casual", from: "", to: "", halfDay: false, reason: "" });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const set = (field, value) => {
    setValues((v) => {
      const next = { ...v, [field]: value };
      // Keep the range valid and half day only for one day
      if (field === "from" && (!next.to || next.to < value)) next.to = value;
      if (next.from !== next.to) next.halfDay = false;
      return next;
    });
    setErrors((e) => ({ ...e, [field]: undefined }));
    setFormError("");
  };

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    setFormError("");
    try {
      const { data } = await api.post("/leaves", values);
      onSaved(data.message);
    } catch (err) {
      const fieldErrors = err.response?.data?.errors;
      if (fieldErrors) setErrors(fieldErrors);
      else setFormError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const singleDay = values.from && values.from === values.to;

  return (
    <form onSubmit={submit} noValidate>
      {formError && (
        <div className="alert" role="alert">
          {formError}
        </div>
      )}
      <div className="form-grid">
        <div className="form-field is-wide">
          <label>Leave type</label>
          <div className="chip-row" role="radiogroup" aria-label="Leave type">
            {LEAVE_TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                role="radio"
                aria-checked={values.type === t.value}
                className={`chip ${values.type === t.value ? "is-active" : ""}`}
                onClick={() => set("type", t.value)}
              >
                {t.label}
              </button>
            ))}
          </div>
          {errors.type && <p className="form-error">{errors.type}</p>}
        </div>

        <div className="form-field">
          <label htmlFor="leave-from">From</label>
          <input
            id="leave-from"
            type="date"
            className={`input ${errors.from ? "has-error" : ""}`}
            value={values.from}
            onChange={(e) => set("from", e.target.value)}
          />
          {errors.from && <p className="form-error">{errors.from}</p>}
        </div>
        <div className="form-field">
          <label htmlFor="leave-to">To</label>
          <input
            id="leave-to"
            type="date"
            className={`input ${errors.to ? "has-error" : ""}`}
            value={values.to}
            min={values.from || undefined}
            onChange={(e) => set("to", e.target.value)}
          />
          {errors.to && <p className="form-error">{errors.to}</p>}
        </div>

        {singleDay && (
          <label className="form-field is-wide leave-half">
            <input type="checkbox" checked={values.halfDay} onChange={(e) => set("halfDay", e.target.checked)} />
            <span>
              Half day only
              <small>You'll work part of the day — a short day won't count as a half-day absence</small>
            </span>
          </label>
        )}

        <div className="form-field is-wide">
          <label htmlFor="leave-reason">Reason</label>
          <textarea
            id="leave-reason"
            className={`input lead-notes ${errors.reason ? "has-error" : ""}`}
            rows={3}
            maxLength={500}
            value={values.reason}
            onChange={(e) => set("reason", e.target.value)}
            placeholder="e.g. Family function, doctor's appointment"
          />
          {errors.reason && <p className="form-error">{errors.reason}</p>}
        </div>
      </div>
      <p className="form-hint leave-hint">
        Only your working days are counted — weekly offs and holidays inside the range are skipped.
        {values.from && values.from < today && " Past dates are fine for up to 30 days (e.g. sick leave)."}
      </p>
      <div className="form-actions">
        <button type="button" className="button button-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="button button-primary" disabled={saving || !values.from || !values.reason.trim()}>
          {saving ? "Sending…" : "Send Request"}
        </button>
      </div>
    </form>
  );
}

/* ================= Admin: review requests ================= */

const TABS = [
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
  { key: "", label: "All" },
];

function LeaveRequests() {
  const [status, setStatus] = useState("pending");
  const [employee, setEmployee] = useState("");
  const [reload, setReload] = useState(0);
  const [team, setTeam] = useState([]);
  const [reviewing, setReviewing] = useState(null); // { leave, decision }
  const [notice, setNotice] = useState("");

  const params = new URLSearchParams({ limit: 30, r: reload });
  if (status) params.set("status", status);
  if (employee) params.set("user", employee);
  const { data, error, loading } = useFetch(`/leaves?${params}`);

  // Pages after the first are appended (reset whenever the filter changes)
  const [extra, setExtra] = useState({ key: "", page: 1, leaves: [] });
  const baseKey = `${status}|${employee}|${reload}`;
  const leaves = [...(data?.leaves ?? []), ...(extra.key === baseKey ? extra.leaves : [])];

  useEffect(() => {
    api
      .get("/users", { params: { limit: 100 } })
      .then(({ data }) => setTeam(data.users.filter((u) => u.role !== ROLES.ADMIN)))
      .catch(() => setTeam([]));
  }, []);

  const loadMore = async () => {
    const next = new URLSearchParams(params);
    const nextPage = (extra.key === baseKey ? extra.page : 1) + 1;
    next.set("page", nextPage);
    const { data: more } = await api.get(`/leaves?${next}`);
    setExtra((x) => ({
      key: baseKey,
      page: nextPage,
      leaves: [...(x.key === baseKey ? x.leaves : []), ...more.leaves],
    }));
  };
  const lastPage = extra.key === baseKey ? extra.page : 1;
  const hasMore = data && lastPage < data.pagination.pages;


  const counts = data?.counts ?? {};
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <>
      <header className="att-head">
        <div className="page-head">
          <h1>Leave Requests</h1>
          <p>Approve or reject leave applied by your team</p>
        </div>
        <div className="att-tabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.key || "all"}
              type="button"
              role="tab"
              aria-selected={status === t.key}
              className={status === t.key ? "is-active" : ""}
              onClick={() => setStatus(t.key)}
            >
              {t.label}
              <span className="leave-count">{t.key ? counts[t.key] || 0 : total}</span>
            </button>
          ))}
        </div>
      </header>

      <div className="att-toolbar">
        <select
          className="input leave-filter"
          value={employee}
          onChange={(e) => setEmployee(e.target.value)}
          aria-label="Filter by employee"
        >
          <option value="">All employees</option>
          {team.map((u) => (
            <option key={u._id} value={u._id}>
              {u.firstName} {u.lastName}
              {u.isActive === false ? " (deactivated)" : ""}
            </option>
          ))}
        </select>
      </div>

      {notice && <div className="notice notice-success leave-notice">{notice}</div>}
      {error && <div className="alert leave-notice">{error}</div>}

      <section className={`panel ${loading && data ? "is-refreshing" : ""}`}>
        {!data ? (
          <p className="panel-empty">{error ? "" : "Loading…"}</p>
        ) : leaves.length === 0 ? (
          <p className="panel-empty">
            {status === "pending" ? "No pending requests — you're all caught up." : "No leave requests here."}
          </p>
        ) : (
          <ul className="leave-list">
            {leaves.map((l) => (
              <li key={l._id} className="leave-item">
                <span className="person-avatar leave-avatar">{l.user?.firstName?.[0] || "?"}</span>
                <div className="leave-main">
                  <p className="leave-who">
                    {l.user ? (
                      <Link to={`/employees/${l.user._id}`}>
                        {l.user.firstName} {l.user.lastName}
                      </Link>
                    ) : (
                      "Removed user"
                    )}
                    {l.user && <span className="att-muted"> · {ROLE_LABELS[l.user.role]}</span>}
                  </p>
                  <p className="leave-title">
                    <span className={`leave-type leave-type-${l.type}`}>{LEAVE_TYPE_LABELS[l.type]}</span>
                    <strong>{formatRange(l)}</strong>
                    <span className="att-muted">· {formatDays(l)}</span>
                  </p>
                  <p className="leave-reason">{l.reason}</p>
                  <p className="leave-review">
                    Applied {formatWhen(l.createdAt)}
                    {l.reviewedBy && (
                      <>
                        {" "}
                        · {LEAVE_STATUS_LABELS[l.status]} by {l.reviewedBy.firstName}
                        {l.reviewNote && <> — “{l.reviewNote}”</>}
                      </>
                    )}
                  </p>
                </div>
                <div className="leave-side">
                  {l.status === "pending" ? (
                    <div className="leave-actions">
                      <button
                        type="button"
                        className="button button-secondary leave-reject"
                        onClick={() => setReviewing({ leave: l, decision: "rejected" })}
                      >
                        <CloseIcon width={16} height={16} /> Reject
                      </button>
                      <button
                        type="button"
                        className="button button-primary"
                        onClick={() => setReviewing({ leave: l, decision: "approved" })}
                      >
                        <CheckIcon width={16} height={16} /> Approve
                      </button>
                    </div>
                  ) : (
                    <LeaveStatus status={l.status} />
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        {hasMore && (
          <div className="emp-more">
            <button type="button" className="button button-secondary" onClick={loadMore}>
              Load more
            </button>
          </div>
        )}
      </section>

      {reviewing && (
        <ReviewDialog
          {...reviewing}
          onClose={() => setReviewing(null)}
          onDone={(message) => {
            setReviewing(null);
            setNotice(message);
            setReload((r) => r + 1);
          }}
        />
      )}
    </>
  );
}

function ReviewDialog({ leave, decision, onClose, onDone }) {
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const approve = decision === "approved";
  const name = leave.user ? `${leave.user.firstName} ${leave.user.lastName}` : "this employee";

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api.patch(`/leaves/${leave._id}/review`, { status: decision, note });
      onDone(`${approve ? "Approved" : "Rejected"} ${name}'s leave (${formatRange(leave)})`);
    } catch (err) {
      setError(getErrorMessage(err));
      setSaving(false);
    }
  };

  return (
    <Modal
      title={approve ? "Approve leave" : "Reject leave"}
      subtitle={`${name} · ${LEAVE_TYPE_LABELS[leave.type]} · ${formatRange(leave)} (${formatDays(leave)})`}
      size="md"
      onClose={onClose}
    >
      <form onSubmit={submit}>
        {error && (
          <div className="alert" role="alert">
            {error}
          </div>
        )}
        <p className="leave-reason leave-dialog-reason">“{leave.reason}”</p>
        <div className="form-field">
          <label htmlFor="review-note">{approve ? "Note (optional)" : "Reason for rejecting (optional)"}</label>
          <textarea
            id="review-note"
            className="input lead-notes"
            rows={2}
            maxLength={300}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={approve ? "e.g. Approved, get well soon" : "e.g. Month-end closing that week"}
            autoFocus
          />
        </div>
        <p className="form-hint leave-hint">
          {approve
            ? "Approved days show as “On leave” in attendance and are never counted as absent."
            : "The employee will see this request as rejected along with your note."}
        </p>
        <div className="form-actions">
          <button type="button" className="button button-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={`button ${approve ? "button-primary" : "button-danger"}`} disabled={saving}>
            {saving ? "Saving…" : approve ? "Approve" : "Reject"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
