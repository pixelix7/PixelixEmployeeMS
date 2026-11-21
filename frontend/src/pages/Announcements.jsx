import { useEffect, useState } from "react";
import api, { getErrorMessage } from "../api/client";
import { useAuth } from "../context/useAuth";
import { ANNOUNCEMENT_AUDIENCES, ROLES } from "../config";
import { todayKey } from "../utils/format";
import Modal from "../components/Modal";
import { AnnouncementCard } from "../components/AnnouncementBits";
import { PencilIcon, PlusIcon, TrashIcon } from "../components/Icons";
import "../components/EmployeeForm.css";
import "../components/LeadForm.css";
import "./Attendance.css";
import "./Announcements.css";

// Keep the result keyed by URL so "loading" is derived (no setState in the effect body)
function useAnnouncements(reload) {
  const url = `/announcements?limit=100&r=${reload}`;
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

export default function Announcements() {
  const { user } = useAuth();
  return user.role === ROLES.ADMIN ? <ManageAnnouncements /> : <TeamAnnouncements />;
}

/* ================= Employees: read ================= */

function TeamAnnouncements() {
  const { data, error } = useAnnouncements(0);

  // Opening this page counts as seeing everything on it.
  // The "New" tags stay until the next visit so they know what changed.
  useEffect(() => {
    if (data?.unread) api.post("/announcements/read").catch(() => {});
  }, [data]);

  return (
    <>
      <header className="page-head">
        <h1>Announcements</h1>
        <p>Updates and notices from the office</p>
      </header>

      {error && <div className="alert ann-alert">{error}</div>}
      {!data ? (
        !error && <p className="panel-empty">Loading…</p>
      ) : data.announcements.length === 0 ? (
        <section className="panel">
          <p className="panel-empty">No announcements right now. Check back later.</p>
        </section>
      ) : (
        <div className="ann-stack">
          {data.announcements.map((a) => (
            <AnnouncementCard key={a._id} announcement={a} isNew={!a.isRead} />
          ))}
        </div>
      )}
    </>
  );
}

/* ================= Admin: post, edit, delete ================= */

function ManageAnnouncements() {
  const [reload, setReload] = useState(0);
  const { data, error, loading } = useAnnouncements(reload);
  const [editing, setEditing] = useState(null); // {} = new, announcement = edit
  const [confirmId, setConfirmId] = useState(null);
  const [notice, setNotice] = useState("");
  const [actionError, setActionError] = useState("");

  const refresh = (message) => {
    setNotice(message);
    setActionError("");
    setReload((r) => r + 1);
  };

  const remove = async (id) => {
    try {
      await api.delete(`/announcements/${id}`);
      setConfirmId(null);
      refresh("Announcement deleted");
    } catch (err) {
      setActionError(getErrorMessage(err));
    }
  };

  // Live ones first (server order: pinned, newest), expired at the bottom
  const list = [...(data?.announcements ?? [])].sort((a, b) => Number(a.expired) - Number(b.expired));
  const live = list.filter((a) => !a.expired).length;

  return (
    <>
      <header className="att-head">
        <div className="page-head">
          <h1>Announcements</h1>
          <p>Post notices that show up on your team's dashboard</p>
        </div>
        <button type="button" className="button button-primary" onClick={() => setEditing({})}>
          <PlusIcon /> New Announcement
        </button>
      </header>

      {notice && <div className="notice notice-success ann-alert">{notice}</div>}
      {(error || actionError) && <div className="alert ann-alert">{error || actionError}</div>}

      {data && list.length > 0 && (
        <div className="att-chips">
          <span>
            <strong>{live}</strong> live
          </span>
          <span>
            <strong>{list.length - live}</strong> expired
          </span>
        </div>
      )}

      {!data ? (
        !error && <p className="panel-empty">Loading…</p>
      ) : list.length === 0 ? (
        <section className="panel">
          <p className="panel-empty">No announcements yet. Post one to let your team know what's happening.</p>
        </section>
      ) : (
        <div className={`ann-stack ${loading ? "is-refreshing" : ""}`}>
          {list.map((a) => (
            <AnnouncementCard
              key={a._id}
              announcement={a}
              showAudience
              footer={
                <footer className="ann-foot">
                  <span className="ann-seen">
                    <span className="ann-seen-bar">
                      <i style={{ width: `${a.audienceSize ? (a.readCount / a.audienceSize) * 100 : 0}%` }} />
                    </span>
                    Seen by {Math.min(a.readCount, a.audienceSize)} of {a.audienceSize}
                  </span>
                  {confirmId === a._id ? (
                    <span className="hol-confirm">
                      Delete for everyone?
                      <button type="button" className="button button-danger" onClick={() => remove(a._id)}>
                        Delete
                      </button>
                      <button type="button" className="button button-secondary" onClick={() => setConfirmId(null)}>
                        Keep
                      </button>
                    </span>
                  ) : (
                    <span className="ann-actions">
                      <button type="button" onClick={() => setEditing(a)} aria-label={`Edit ${a.title}`}>
                        <PencilIcon width={16} height={16} /> Edit
                      </button>
                      <button
                        type="button"
                        className="is-danger"
                        onClick={() => setConfirmId(a._id)}
                        aria-label={`Delete ${a.title}`}
                      >
                        <TrashIcon width={16} height={16} /> Delete
                      </button>
                    </span>
                  )}
                </footer>
              }
            />
          ))}
        </div>
      )}

      {editing && (
        <Modal
          title={editing._id ? "Edit Announcement" : "New Announcement"}
          subtitle={editing._id ? undefined : "It appears on employees' dashboards right away"}
          size="md"
          onClose={() => setEditing(null)}
        >
          <AnnouncementForm
            announcement={editing._id ? editing : null}
            onCancel={() => setEditing(null)}
            onSaved={(message) => {
              setEditing(null);
              refresh(message);
            }}
          />
        </Modal>
      )}
    </>
  );
}

function AnnouncementForm({ announcement, onSaved, onCancel }) {
  const [values, setValues] = useState(() => ({
    title: announcement?.title || "",
    message: announcement?.message || "",
    audience: announcement?.audience || "all",
    priority: announcement?.priority || "normal",
    pinned: announcement?.pinned || false,
    expiresOn: announcement?.expiresOn || "",
  }));
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
      const { data } = announcement
        ? await api.patch(`/announcements/${announcement._id}`, values)
        : await api.post("/announcements", values);
      onSaved(data.message);
    } catch (err) {
      const fieldErrors = err.response?.data?.errors;
      if (fieldErrors) setErrors(fieldErrors);
      else setFormError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate>
      {formError && (
        <div className="alert" role="alert">
          {formError}
        </div>
      )}
      <div className="form-grid">
        <div className="form-field is-wide">
          <label htmlFor="ann-title">Title</label>
          <input
            id="ann-title"
            className={`input ${errors.title ? "has-error" : ""}`}
            value={values.title}
            maxLength={120}
            onChange={(e) => set("title", e.target.value)}
            placeholder="e.g. Office closed on Friday"
            autoFocus
          />
          {errors.title && <p className="form-error">{errors.title}</p>}
        </div>

        <div className="form-field is-wide">
          <label htmlFor="ann-message">Message</label>
          <textarea
            id="ann-message"
            className={`input lead-notes ${errors.message ? "has-error" : ""}`}
            rows={5}
            maxLength={2000}
            value={values.message}
            onChange={(e) => set("message", e.target.value)}
            placeholder="Write the details your team needs to know…"
          />
          <p className="form-hint ann-counter">{values.message.length} / 2000</p>
          {errors.message && <p className="form-error">{errors.message}</p>}
        </div>

        <div className="form-field is-wide">
          <label>Who should see it?</label>
          <div className="chip-row" role="radiogroup" aria-label="Audience">
            {ANNOUNCEMENT_AUDIENCES.map((a) => (
              <button
                key={a.value}
                type="button"
                role="radio"
                aria-checked={values.audience === a.value}
                className={`chip ${values.audience === a.value ? "is-active" : ""}`}
                onClick={() => set("audience", a.value)}
              >
                {a.label}
              </button>
            ))}
          </div>
        </div>

        <div className="form-field">
          <label htmlFor="ann-expires">Show until (optional)</label>
          <input
            id="ann-expires"
            type="date"
            className={`input ${errors.expiresOn ? "has-error" : ""}`}
            value={values.expiresOn}
            min={announcement ? undefined : todayKey()}
            onChange={(e) => set("expiresOn", e.target.value)}
          />
          {errors.expiresOn && <p className="form-error">{errors.expiresOn}</p>}
        </div>

        <div className="form-field ann-toggles">
          <label className="ann-check">
            <input
              type="checkbox"
              checked={values.priority === "important"}
              onChange={(e) => set("priority", e.target.checked ? "important" : "normal")}
            />
            <span>
              Mark as important
              <small>Highlighted in red</small>
            </span>
          </label>
          <label className="ann-check">
            <input type="checkbox" checked={values.pinned} onChange={(e) => set("pinned", e.target.checked)} />
            <span>
              Pin to top
              <small>Stays above newer posts</small>
            </span>
          </label>
        </div>
      </div>
      <div className="form-actions">
        <button type="button" className="button button-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="submit"
          className="button button-primary"
          disabled={saving || !values.title.trim() || !values.message.trim()}
        >
          {saving ? "Saving…" : announcement ? "Save Changes" : "Post Announcement"}
        </button>
      </div>
    </form>
  );
}
