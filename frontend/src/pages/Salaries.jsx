import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import api, { getErrorMessage } from "../api/client";
import { PAYMENT_MODE_LABELS, ROLE_LABELS } from "../config";
import { formatDate, formatMoney, formatMonth, todayKey } from "../utils/format";
import Modal from "../components/Modal";
import { PayForm, SalaryForm, SalaryHistory } from "../components/SalaryForms";
import { CheckIcon, ClockIcon, HistoryIcon, PencilIcon, PlusIcon, RupeeIcon, SearchIcon, UsersIcon } from "../components/Icons";
import "./Dashboard.css";
import "../components/AttendanceTable.css";
import "./Employees.css";
import "./Attendance.css";
import "./Salaries.css";

const TABS = [
  { key: "", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "paid", label: "Paid" },
  { key: "missing", label: "Not created" },
];

// Admin: one month's salaries and incentives for every employee
export default function Salaries() {
  const [params, setParams] = useSearchParams();
  const thisMonth = todayKey().slice(0, 7);
  const month = params.get("month") || thisMonth;
  const tab = TABS.some((t) => t.key === params.get("status")) ? params.get("status") : "";
  const [search, setSearch] = useState("");
  const [reload, setReload] = useState(0);
  const [result, setResult] = useState({ key: null, data: null, error: "" });
  const [modal, setModal] = useState(null); // { mode: "edit" | "pay" | "history", row }
  const [toast, setToast] = useState("");
  const [generating, setGenerating] = useState(false);

  const key = `${month}|${reload}`;
  const loading = result.key !== key;

  useEffect(() => {
    let cancelled = false;
    api
      .get("/salaries", { params: { month } })
      .then(({ data }) => !cancelled && setResult({ key, data, error: "" }))
      .catch((err) => !cancelled && setResult({ key, data: null, error: getErrorMessage(err) }));
    return () => {
      cancelled = true;
    };
  }, [key, month]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(t);
  }, [toast]);

  const update = (changes) => {
    const next = { month, status: tab, ...changes };
    setParams(Object.fromEntries(Object.entries(next).filter(([, v]) => v)), { replace: true });
  };

  const done = (message) => {
    setModal(null);
    setToast(message);
    setReload((r) => r + 1);
  };

  const generate = async () => {
    setGenerating(true);
    try {
      const { data } = await api.post("/salaries/generate", { month });
      done(data.message);
    } catch (err) {
      setToast(getErrorMessage(err));
    } finally {
      setGenerating(false);
    }
  };

  const data = result.data;
  const t = data?.totals;
  // Status tabs and search are applied here so switching is instant
  const q = search.trim().toLowerCase();
  const rows = (data?.rows ?? []).filter((r) => {
    if (tab === "missing" && r.record) return false;
    if ((tab === "pending" || tab === "paid") && r.record?.status !== tab) return false;
    return !q || `${r.user.firstName} ${r.user.lastName} ${r.user.email}`.toLowerCase().includes(q);
  });
  const counts = t && { "": t.employees, pending: t.pendingCount, paid: t.paidCount, missing: t.missing };

  const cards = [
    { label: "Total Payout", value: t && formatMoney(t.net), sub: t && `${t.records} of ${t.employees} records created`, Icon: RupeeIcon },
    { label: "Paid", value: t && formatMoney(t.paid), sub: t && `${t.paidCount} employee${t.paidCount === 1 ? "" : "s"}`, Icon: CheckIcon },
    { label: "Pending", value: t && formatMoney(t.pending), sub: t && `${t.pendingCount} to pay`, Icon: ClockIcon },
    {
      label: "Incentives",
      value: t && formatMoney(t.incentives),
      sub: t && (t.deductions ? `${formatMoney(t.deductions)} deducted` : "No deductions"),
      Icon: UsersIcon,
    },
  ];

  return (
    <>
      <header className="att-head">
        <div className="page-head">
          <h1>Salary & Incentives</h1>
          <p>Monthly pay records for every employee — base salary, incentives, deductions and payment status</p>
        </div>
        <div className="sal-head-actions">
          <input
            type="month"
            className="input"
            value={month}
            max={thisMonth}
            onChange={(e) => e.target.value && update({ month: e.target.value })}
            aria-label="Month"
          />
          <button
            type="button"
            className="button button-secondary"
            onClick={generate}
            disabled={generating || !data || t.missing === 0}
            title="Create pending records for everyone who doesn't have one, using their last base salary"
          >
            <PlusIcon /> {generating ? "Generating…" : "Generate Month"}
          </button>
        </div>
      </header>

      <section className="stat-grid">
        {cards.map(({ label, value, sub, Icon }) => (
          <article key={label} className="stat-card">
            <div>
              <p className="stat-label">{label}</p>
              <p className="stat-value">{data && !loading ? value : <span className="skeleton" />}</p>
              {sub && data && <p className="stat-sub">{sub}</p>}
            </div>
            <span className="stat-icon">
              <Icon />
            </span>
          </article>
        ))}
      </section>

      <div className="sal-toolbar">
        <div className="att-tabs" role="tablist">
          {TABS.map((x) => (
            <button
              key={x.key || "all"}
              type="button"
              role="tab"
              aria-selected={tab === x.key}
              className={`${tab === x.key ? "is-active" : ""} ${x.key === "missing" && counts?.missing ? "has-alert" : ""}`}
              onClick={() => update({ status: x.key })}
            >
              {x.label}
              <span className="sal-count">{counts?.[x.key] ?? 0}</span>
            </button>
          ))}
        </div>
        <div className="emp-search sal-search">
          <SearchIcon />
          <input
            className="input"
            type="search"
            placeholder="Search employees..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search employees"
          />
        </div>
      </div>

      {result.error && <div className="alert sal-alert">{result.error}</div>}

      <section className={`panel ${loading && data ? "is-refreshing" : ""}`}>
        <div className="panel-head">
          <h2>{formatMonth(month)}</h2>
        </div>
        {!data ? (
          <p className="panel-empty">{result.error ? "" : "Loading…"}</p>
        ) : rows.length === 0 ? (
          <p className="panel-empty">{q ? "No employees match your search." : "Nothing here for this month."}</p>
        ) : (
          <div className="att-table-wrap">
            <table className="att-table sal-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Attendance</th>
                  <th>Base</th>
                  <th>Incentives</th>
                  <th>Deductions</th>
                  <th>Net pay</th>
                  <th>Status</th>
                  <th className="sal-actions-col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const r = row.record;
                  const a = row.attendance;
                  return (
                    <tr key={row.user._id} className={r ? "" : "is-missing"}>
                      <td>
                        <Link to={`/employees/${row.user._id}`} className="sal-name">
                          {row.user.firstName} {row.user.lastName}
                        </Link>
                        <span className="att-muted sal-sub">
                          {ROLE_LABELS[row.user.role]}
                          {row.user.isActive === false ? " · deactivated" : ""}
                        </span>
                      </td>
                      <td>
                        {a ? (
                          <>
                            <span className="sal-att-main">
                              {a.present}P · <span className={a.absent ? "sal-minus" : ""}>{a.absent}A</span>
                            </span>
                            <span className="att-muted sal-sub">
                              {a.leaveDays ? `${a.leaveDays} leave · ` : ""}
                              {a.rate ?? "—"}%
                            </span>
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      {r ? (
                        <>
                          <td>{formatMoney(r.baseSalary)}</td>
                          <td className="sal-plus" title={r.incentives.map((l) => `${l.title}: ${formatMoney(l.amount)}`).join("\n")}>
                            {r.incentiveTotal ? `+${formatMoney(r.incentiveTotal)}` : "—"}
                            {r.incentives.length > 0 && <span className="att-muted sal-sub">{r.incentives.length} item{r.incentives.length === 1 ? "" : "s"}</span>}
                          </td>
                          <td className="sal-minus" title={r.deductions.map((l) => `${l.title}: ${formatMoney(l.amount)}`).join("\n")}>
                            {r.deductionTotal ? `−${formatMoney(r.deductionTotal)}` : "—"}
                          </td>
                          <td>
                            <strong className="sal-net-cell">{formatMoney(r.netPay)}</strong>
                          </td>
                          <td>
                            <span className={`sal-pill sal-${r.status}`}>{r.status === "paid" ? "Paid" : "Pending"}</span>
                            {r.status === "paid" && (
                              <span className="att-muted sal-sub">
                                {formatDate(r.paidOn)} · {PAYMENT_MODE_LABELS[r.paymentMode]}
                              </span>
                            )}
                          </td>
                          <td className="sal-actions-col">
                            <div className="sal-row-actions">
                              {r.status === "pending" && (
                                <button type="button" className="sal-btn is-pay" onClick={() => setModal({ mode: "pay", row })} title="Mark as paid">
                                  <CheckIcon width={15} height={15} /> Pay
                                </button>
                              )}
                              <button type="button" className="sal-btn is-icon" onClick={() => setModal({ mode: "edit", row })} aria-label={`Edit salary of ${row.user.firstName}`} title="Edit salary">
                                <PencilIcon width={16} height={16} />
                              </button>
                              <button type="button" className="sal-btn is-icon" onClick={() => setModal({ mode: "history", row })} aria-label={`Salary history of ${row.user.firstName}`} title="Salary history">
                                <HistoryIcon width={16} height={16} />
                              </button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td colSpan={5} className="sal-none">
                            No record yet{row.suggestedBase != null && <> · last base {formatMoney(row.suggestedBase)}</>}
                          </td>
                          <td className="sal-actions-col">
                            <div className="sal-row-actions">
                              <button type="button" className="sal-btn is-add" onClick={() => setModal({ mode: "edit", row })}>
                                <PlusIcon width={15} height={15} /> Add
                              </button>
                              <button type="button" className="sal-btn is-icon" onClick={() => setModal({ mode: "history", row })} aria-label={`Salary history of ${row.user.firstName}`} title="Salary history">
                                <HistoryIcon width={16} height={16} />
                              </button>
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
              {t.records > 0 && !q && !tab && (
                <tfoot>
                  <tr>
                    <td colSpan={2}>Total ({t.records} records)</td>
                    <td>{formatMoney(t.base)}</td>
                    <td className="sal-plus">+{formatMoney(t.incentives)}</td>
                    <td className="sal-minus">−{formatMoney(t.deductions)}</td>
                    <td>
                      <strong>{formatMoney(t.net)}</strong>
                    </td>
                    <td colSpan={2} className="att-muted">
                      {formatMoney(t.paid)} paid · {formatMoney(t.pending)} pending
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </section>

      {modal?.mode === "edit" && (
        <Modal
          title={`${modal.row.record ? "Edit" : "Add"} salary · ${modal.row.user.firstName} ${modal.row.user.lastName}`}
          subtitle={formatMonth(month)}
          size="md"
          onClose={() => setModal(null)}
        >
          <SalaryForm
            row={modal.row}
            month={month}
            onSaved={done}
            onDeleted={() => done("Salary record deleted")}
            onCancel={() => setModal(null)}
          />
        </Modal>
      )}
      {modal?.mode === "pay" && (
        <Modal
          title={`Mark paid · ${modal.row.user.firstName} ${modal.row.user.lastName}`}
          subtitle={formatMonth(month)}
          size="sm"
          onClose={() => setModal(null)}
        >
          <PayForm record={modal.row.record} onSaved={done} onCancel={() => setModal(null)} />
        </Modal>
      )}
      {modal?.mode === "history" && (
        <Modal title={`Salary history · ${modal.row.user.firstName} ${modal.row.user.lastName}`} onClose={() => setModal(null)}>
          <SalaryHistory userId={modal.row.user._id} />
        </Modal>
      )}

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </>
  );
}
