import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api, { getErrorMessage } from "../api/client";
import { WORK_CATEGORIES, WORK_STATUS_LABELS, workStatusesFor } from "../config";
import { formatTime } from "../utils/format";
import { ArrowRightIcon, PlusIcon } from "./Icons";
import Modal from "./Modal";
import { CategoryBadge, WorkStatusPill } from "./WorkBits";
import WorkItemForm from "./WorkItemForm";
import "./TodayWork.css";

const formatDue = (iso) =>
  new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

// Digital marketer dashboard: log work fast, move it along, close it out
export default function TodayWork() {
  const [board, setBoard] = useState(null);
  const [error, setError] = useState("");
  const [quick, setQuick] = useState({ category: WORK_CATEGORIES[0].value, title: "", client: "" });
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [editing, setEditing] = useState(null);
  const [toast, setToast] = useState("");

  const load = useCallback(
    () =>
      api
        .get("/work/board")
        .then(({ data }) => {
          setBoard({ ...data, loadedAt: Date.now() });
          setError("");
        })
        .catch((err) => setError(getErrorMessage(err))),
    []
  );

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const quickAdd = async (e) => {
    e.preventDefault();
    if (!quick.title.trim()) return;
    setAdding(true);
    try {
      await api.post("/work", { ...quick, status: "pending" });
      setQuick((q) => ({ ...q, title: "", client: "" }));
      setToast("Work added");
      await load();
    } catch (err) {
      setToast(getErrorMessage(err));
    } finally {
      setAdding(false);
    }
  };

  // Change status straight from the list
  const changeStatus = async (item, status) => {
    setBusyId(item._id);
    try {
      await api.patch(`/work/${item._id}`, { status });
      setToast(`${item.title} → ${WORK_STATUS_LABELS[status]}`);
      await load();
    } catch (err) {
      setToast(getErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  const s = board?.stats;
  const chips = [
    { label: "Open", value: s?.open },
    { label: "Done today", value: s?.doneToday, tone: "good" },
    { label: "Won this month", value: s?.wonThisMonth, tone: "good" },
    { label: "Overdue", value: s?.overdue, tone: s?.overdue ? "bad" : "" },
  ];

  return (
    <section className="panel tw-panel">
      <div className="panel-head">
        <h2>Today's Work</h2>
        <Link to="/work" className="panel-link">
          Work log <ArrowRightIcon width={16} height={16} />
        </Link>
      </div>

      <div className="tw-stats">
        {chips.map((c) => (
          <div key={c.label} className={`tw-stat ${c.tone ? `is-${c.tone}` : ""}`}>
            <strong>{c.value ?? "–"}</strong>
            <span>{c.label}</span>
          </div>
        ))}
      </div>

      {/* Quick add: pick a type, type the work, Enter */}
      <form className="tw-quick" onSubmit={quickAdd}>
        <div className="chip-row">
          {WORK_CATEGORIES.map((c) => (
            <button
              key={c.value}
              type="button"
              className={`chip ${quick.category === c.value ? "is-active" : ""}`}
              onClick={() => setQuick((q) => ({ ...q, category: c.value }))}
            >
              {c.label}
            </button>
          ))}
        </div>
        <div className="tw-quick-row">
          <input
            className="input"
            value={quick.title}
            onChange={(e) => setQuick((q) => ({ ...q, title: e.target.value }))}
            placeholder="What are you working on? e.g. Instagram audit, 3 Diwali banners…"
            aria-label="Work title"
            maxLength={160}
          />
          <input
            className="input tw-client"
            value={quick.client}
            onChange={(e) => setQuick((q) => ({ ...q, client: e.target.value }))}
            placeholder="Client / brand"
            aria-label="Client or brand"
            maxLength={120}
          />
          <button type="submit" className="button button-primary" disabled={adding || !quick.title.trim()}>
            <PlusIcon /> {adding ? "Adding…" : "Add"}
          </button>
        </div>
      </form>

      {error ? (
        <p className="panel-empty">{error}</p>
      ) : !board ? (
        <p className="panel-empty">Loading…</p>
      ) : (
        <>
          <p className="tw-section">Open ({board.open.length})</p>
          {board.open.length === 0 ? (
            <p className="panel-empty tw-empty">Nothing open. Add what you're working on above.</p>
          ) : (
            <ul className="tw-list">
              {board.open.map((item) => {
                const overdue = item.dueDate && new Date(item.dueDate).getTime() < board.loadedAt;
                return (
                  <li key={item._id} className={`tw-item ${item.assignedBy ? "is-assigned" : ""}`}>
                    <CategoryBadge category={item.category} />
                    <div className="tw-main">
                      <p className="tw-title">{item.title}</p>
                      <p className="tw-meta">
                        {item.client && <span>{item.client}</span>}
                        {item.assignedBy && <span>From {item.assignedBy.firstName}</span>}
                        {item.dueDate && (
                          <span className={overdue ? "tw-overdue" : ""}>
                            {overdue ? "Overdue · " : "Due "}
                            {formatDue(item.dueDate)}
                          </span>
                        )}
                      </p>
                    </div>
                    <select
                      className="input tw-status"
                      value={item.status}
                      onChange={(e) => changeStatus(item, e.target.value)}
                      disabled={busyId === item._id}
                      aria-label={`Status of ${item.title}`}
                    >
                      {workStatusesFor(item.category).map((st) => (
                        <option key={st} value={st}>
                          {WORK_STATUS_LABELS[st]}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="button button-secondary tw-update"
                      onClick={() => setEditing(item)}
                    >
                      Update
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <p className="tw-section">Done today ({board.doneToday.length})</p>
          {board.doneToday.length === 0 ? (
            <p className="panel-empty tw-empty">Nothing closed yet today.</p>
          ) : (
            <ul className="tw-list">
              {board.doneToday.map((item) => {
                const last = [...item.updates].reverse().find((u) => u.note);
                return (
                  <li key={item._id} className="tw-item is-done" onClick={() => setEditing(item)}>
                    <CategoryBadge category={item.category} />
                    <div className="tw-main">
                      <p className="tw-title">{item.title}</p>
                      <p className="tw-meta">
                        {item.client && <span>{item.client}</span>}
                        {last && <span>“{last.note}”</span>}
                      </p>
                    </div>
                    <WorkStatusPill status={item.status} />
                    <span className="tw-time">{formatTime(item.closedAt)}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      {editing && (
        <Modal
          title={editing.title}
          subtitle="Update the status, add a note, or close it out"
          onClose={() => setEditing(null)}
        >
          <WorkItemForm
            item={editing}
            onSaved={(_item, message) => {
              setEditing(null);
              setToast(message);
              load();
            }}
            onDeleted={() => {
              setEditing(null);
              setToast("Work item deleted");
              load();
            }}
            onCancel={() => setEditing(null)}
          />
        </Modal>
      )}

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </section>
  );
}
