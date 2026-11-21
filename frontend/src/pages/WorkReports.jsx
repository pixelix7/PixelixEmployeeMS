import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import api, { getErrorMessage } from "../api/client";
import { useAuth } from "../context/useAuth";
import { ROLES, ROLE_LABELS } from "../config";
import { formatDay, formatLongDay, formatMonth, formatWhen, todayKey } from "../utils/format";
import Modal from "../components/Modal";
import { DayContext, ReportBody, ReportForm, ReportStatusPill, ReviewForm, ReviewNote } from "../components/WorkReportBits";
import { CheckIcon, CloseIcon, PencilIcon, PlusIcon } from "../components/Icons";
import "./Employees.css";
import "./Attendance.css";
import "./WorkReports.css";

// Keyed by URL so "loading" is derived (no setState in the effect body)
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

// Yesterday in the office timezone, e.g. "2026-11-20"
const yesterday = () => {
  const [y, m, d] = todayKey().split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
};

function useToast() {
  const [toast, setToast] = useState("");
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(t);
  }, [toast]);
  const node = toast && (
    <div className="toast" role="status">
      {toast}
    </div>
  );
  return [node, setToast];
}

export default function WorkReports() {
  const { user } = useAuth();
  return user.role === ROLES.ADMIN ? <ReviewReports /> : <MyReports />;
}

/* ================= Employee ================= */

function MyReports() {
  const thisMonth = todayKey().slice(0, 7);
  const [month, setMonth] = useState(thisMonth);
  const [reload, setReload] = useState(0);
  const { data, error, loading } = useFetch(`/work-reports/me?month=${month}&r=${reload}`);
  const [modal, setModal] = useState(null); // { report? } edit, or { pastDay: true }
  const [toastNode, setToast] = useToast();

  const saved = (message) => {
    setModal(null);
    setToast(message);
    setReload((r) => r + 1);
  };

  const todayReport = data?.todayReport;
  // Today's report already has its own card at the top
  const history = (data?.reports ?? []).filter((r) => r.date !== data.today);

  return (
    <>
      <header className="att-head">
        <div className="page-head">
          <h1>Work Reports</h1>
          <p>Tell the admin what you worked on each day — they'll approve it or ask for changes</p>
        </div>
        <button type="button" className="button button-secondary" onClick={() => setModal({ pastDay: true })}>
          <PlusIcon /> Report a Missed Day
        </button>
      </header>

      {error && <div className="alert wr-alert">{error}</div>}

      {/* Today */}
      <section className="panel wr-today">
        <div className="panel-head">
          <h2>
            Today · <span className="wr-today-date">{formatLongDay(todayKey())}</span>
          </h2>
          {todayReport && <ReportStatusPill status={todayReport.status} />}
        </div>
        <div className="wr-today-body">
          {!data ? (
            <p className="panel-empty">Loading…</p>
          ) : todayReport ? (
            <>
              <DayContext day={todayReport.day} />
              <ReportBody report={todayReport} />
              <ReviewNote report={todayReport} />
              {todayReport.status !== "approved" && (
                <div className="wr-card-actions">
                  <button type="button" className={`button ${todayReport.status === "rejected" ? "button-primary" : "button-secondary"}`} onClick={() => setModal({ report: todayReport })}>
                    <PencilIcon width={16} height={16} /> {todayReport.status === "rejected" ? "Edit & Resubmit" : "Edit Report"}
                  </button>
                </div>
              )}
            </>
          ) : (
            <ReportForm key={reload} defaultDate={data.today} earliest={data.earliest} lockDate onSaved={saved} />
          )}
        </div>
      </section>

      {/* History */}
      <section className={`panel ${loading && data ? "is-refreshing" : ""}`}>
        <div className="panel-head">
          <h2>
            My reports
            {data && (
              <span className="att-meta">
                {" "}
                · {data.counts.approved} approved · {data.counts.pending} pending
                {data.counts.rejected ? ` · ${data.counts.rejected} need changes` : ""}
              </span>
            )}
          </h2>
          <input
            type="month"
            className="input wr-month"
            value={month}
            max={thisMonth}
            onChange={(e) => e.target.value && setMonth(e.target.value)}
            aria-label="Month"
          />
        </div>
        {!data ? (
          <p className="panel-empty">{error ? "" : "Loading…"}</p>
        ) : history.length === 0 ? (
          <p className="panel-empty">No {month === thisMonth ? "earlier " : ""}reports in {formatMonth(month)}.</p>
        ) : (
          <ul className="wr-list">
            {history.map((r) => (
              <li key={r._id} className={`wr-item is-${r.status}`}>
                <div className="wr-item-head">
                  <strong>{formatDay(r.date)}</strong>
                  <ReportStatusPill status={r.status} />
                  <span className="att-muted wr-when">Submitted {formatWhen(r.submittedAt)}</span>
                  {r.status !== "approved" && (
                    <button type="button" className="wr-link" onClick={() => setModal({ report: r })}>
                      {r.status === "rejected" ? "Edit & resubmit" : "Edit"}
                    </button>
                  )}
                </div>
                <DayContext day={r.day} />
                <ReportBody report={r} />
                <ReviewNote report={r} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {modal && (
        <Modal
          title={modal.report ? `Report for ${formatLongDay(modal.report.date)}` : "Report a missed day"}
          subtitle={modal.report?.status === "rejected" ? "Fix it and resubmit for review" : undefined}
          size="md"
          onClose={() => setModal(null)}
        >
          <ReportForm
            report={modal.report}
            defaultDate={modal.pastDay ? yesterday() : undefined}
            earliest={data?.earliest}
            onSaved={saved}
            onCancel={() => setModal(null)}
          />
        </Modal>
      )}
      {toastNode}
    </>
  );
}

/* ================= Admin ================= */

const TABS = [
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Sent back" },
  { key: "all", label: "All" },
];

function ReviewReports() {
  const [params, setParams] = useSearchParams();
  const status = TABS.some((t) => t.key === params.get("status")) ? params.get("status") : "pending";
  const employee = params.get("employee") || "";
  const date = params.get("date") || "";
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  const [team, setTeam] = useState([]);
  const [reviewing, setReviewing] = useState(null); // { report, decision }
  const [busyId, setBusyId] = useState(null);
  const [toastNode, setToast] = useToast();

  useEffect(() => {
    api
      .get("/users", { params: { limit: 100 } })
      .then(({ data }) => setTeam(data.users.filter((u) => u.role !== ROLES.ADMIN)))
      .catch(() => setTeam([]));
  }, []);

  const qs = new URLSearchParams({ status, page, r: reload });
  if (employee) qs.set("user", employee);
  if (date) qs.set("date", date);
  const { data, error, loading } = useFetch(`/work-reports?${qs}`);

  const update = (changes) => {
    const next = { status, employee, date, ...changes };
    setParams(Object.fromEntries(Object.entries(next).filter(([, v]) => v)), { replace: true });
    setPage(1);
  };

  const refresh = (message) => {
    setReviewing(null);
    setToast(message);
    setReload((r) => r + 1);
  };

  // One-click approve (no note)
  const approve = async (report) => {
    setBusyId(report._id);
    try {
      await api.patch(`/work-reports/${report._id}/review`, { status: "approved" });
      refresh(`Approved ${report.user.firstName}'s report for ${formatDay(report.date)}`);
    } catch (err) {
      setToast(getErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  const reports = data?.reports ?? [];
  const pendingShown = reports.filter((r) => r.status === "pending");

  const approveShown = async () => {
    setBusyId("all");
    try {
      const { data: res } = await api.post("/work-reports/approve-all", { ids: pendingShown.map((r) => r._id) });
      refresh(res.message);
    } catch (err) {
      setToast(getErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  const counts = data?.counts ?? {};

  return (
    <>
      <header className="att-head">
        <div className="page-head">
          <h1>Work Reports</h1>
          <p>Daily reports from your team — approve them or send them back with a note</p>
        </div>
        <div className="att-tabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={status === t.key}
              className={`${status === t.key ? "is-active" : ""} ${t.key === "pending" && counts.pending ? "has-alert" : ""}`}
              onClick={() => update({ status: t.key })}
            >
              {t.label}
              <span className="wr-count-badge">{counts[t.key] ?? 0}</span>
            </button>
          ))}
        </div>
      </header>

      <div className="wr-toolbar">
        <select className="input wr-filter" value={employee} onChange={(e) => update({ employee: e.target.value })} aria-label="Filter by employee">
          <option value="">All employees</option>
          {team.map((u) => (
            <option key={u._id} value={u._id}>
              {u.firstName} {u.lastName}
              {u.isActive === false ? " (deactivated)" : ""}
            </option>
          ))}
        </select>
        <input
          type="date"
          className="input wr-filter-date"
          value={date}
          max={todayKey()}
          onChange={(e) => update({ date: e.target.value })}
          aria-label="Filter by day"
        />
        {date && (
          <button type="button" className="button button-secondary" onClick={() => update({ date: "" })}>
            Any day
          </button>
        )}
        {pendingShown.length > 1 && (
          <button type="button" className="button button-secondary wr-approve-all" onClick={approveShown} disabled={busyId === "all"}>
            <CheckIcon width={16} height={16} /> {busyId === "all" ? "Approving…" : `Approve all ${pendingShown.length} shown`}
          </button>
        )}
      </div>

      {error && <div className="alert wr-alert">{error}</div>}

      {!data ? (
        <section className="panel">
          <p className="panel-empty">{error ? "" : "Loading…"}</p>
        </section>
      ) : reports.length === 0 ? (
        <section className="panel">
          <p className="panel-empty">
            {status === "pending" ? "No reports waiting for review — you're all caught up." : "No reports here."}
          </p>
        </section>
      ) : (
        <div className={`wr-cards ${loading ? "is-refreshing" : ""}`}>
          {reports.map((r) => {
            const resubmitted = r.history?.some((h) => h.action === "resubmitted");
            return (
              <article key={r._id} className={`panel wr-card is-${r.status}`}>
                <header className="wr-card-head">
                  <span className="person-avatar">{r.user?.firstName?.[0] || "?"}</span>
                  <div className="wr-card-who">
                    {r.user ? (
                      <Link to={`/employees/${r.user._id}`} className="wr-name">
                        {r.user.firstName} {r.user.lastName}
                      </Link>
                    ) : (
                      <span className="wr-name">Removed user</span>
                    )}
                    <span className="att-muted">
                      {r.user && ROLE_LABELS[r.user.role]} · {formatLongDay(r.date)}
                    </span>
                  </div>
                  <div className="wr-card-meta">
                    {resubmitted && r.status === "pending" && <span className="wr-resub">Resubmitted</span>}
                    <ReportStatusPill status={r.status} />
                    <span className="att-muted">{formatWhen(r.submittedAt)}</span>
                  </div>
                </header>
                <DayContext day={r.day} />
                <ReportBody report={r} />
                <ReviewNote report={r} />
                {r.status === "pending" && (
                  <div className="wr-card-actions">
                    <button
                      type="button"
                      className="button button-secondary wr-reject"
                      onClick={() => setReviewing({ report: r, decision: "rejected" })}
                    >
                      <CloseIcon width={16} height={16} /> Send Back
                    </button>
                    <button type="button" className="button button-secondary" onClick={() => setReviewing({ report: r, decision: "approved" })}>
                      Approve with note
                    </button>
                    <button type="button" className="button button-primary" onClick={() => approve(r)} disabled={busyId === r._id}>
                      <CheckIcon width={16} height={16} /> {busyId === r._id ? "Approving…" : "Approve"}
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {data && data.pagination.pages > 1 && (
        <div className="wr-pager">
          <button type="button" className="button button-secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </button>
          <span>
            Page {page} of {data.pagination.pages}
          </span>
          <button type="button" className="button button-secondary" disabled={page >= data.pagination.pages} onClick={() => setPage((p) => p + 1)}>
            Next
          </button>
        </div>
      )}

      {reviewing && (
        <Modal
          title={reviewing.decision === "approved" ? "Approve report" : "Send report back"}
          subtitle={`${reviewing.report.user.firstName} ${reviewing.report.user.lastName} · ${formatLongDay(reviewing.report.date)}`}
          size="md"
          onClose={() => setReviewing(null)}
        >
          <ReviewForm report={reviewing.report} decision={reviewing.decision} onDone={refresh} onCancel={() => setReviewing(null)} />
        </Modal>
      )}
      {toastNode}
    </>
  );
}
