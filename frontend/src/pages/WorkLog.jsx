import {useCallback, useEffect, useState} from "react";
import api, {getErrorMessage} from "../api/client";
import {useAuth} from "../context/useAuth";
import {
    CLOSED_WORK_STATUSES,
    ROLES,
    WORK_CATEGORIES,
    WORK_STATUS_LABELS,
} from "../config";
import Modal from "../components/Modal";
import WorkItemForm from "../components/WorkItemForm";
import {CategoryBadge, WorkStatusPill} from "../components/WorkBits";
import {PlusIcon} from "../components/Icons";
import {formatDay, formatWhen} from "../utils/format";
import "./Dashboard.css";
import "./Employees.css";
import "../components/AttendanceTable.css";
import "./Leads.css";
import "./WorkLog.css";

const PAGE_SIZE = 25;

export default function WorkLog() {
    const {user} = useAuth();
    const isAdmin = user.role === ROLES.ADMIN;
    const [date, setDate] = useState("");
    const [category, setCategory] = useState("");
    const [status, setStatus] = useState("");
    const [owner, setOwner] = useState("");
    const [team, setTeam] = useState([]);
    const [reloadKey, setReloadKey] = useState(0);
    const [result, setResult] = useState({
        key: null,
        items: [],
        pagination: null,
        error: "",
        at: 0,
    });
    const [loadingMore, setLoadingMore] = useState(false);
    const [modal, setModal] = useState(null); // { type: "add" } | { type: "edit", item }
    const [toast, setToast] = useState("");

    const queryKey = `${date}|${category}|${status}|${owner}|${reloadKey}`;
    const loading = result.key !== queryKey;

    const params = useCallback(
        (page = 1) => ({
            date: date || undefined,
            category: category || undefined,
            status: status || undefined,
            owner: owner || undefined,
            limit: PAGE_SIZE,
            page,
        }),
        [date, category, status, owner],
    );

    // Admins filter by team member
    useEffect(() => {
        if (!isAdmin) return;
        api.get("/users", {params: {role: "digital_marketing", limit: 100}})
            .then(({data}) => setTeam(data.users))
            .catch(() => setTeam([]));
    }, [isAdmin]);

    useEffect(() => {
        let cancelled = false;
        api.get("/work", {params: params()})
            .then(({data}) => {
                if (!cancelled)
                    setResult({
                        key: queryKey,
                        items: data.items,
                        pagination: data.pagination,
                        error: "",
                        at: Date.now(),
                    });
            })
            .catch((err) => {
                if (!cancelled)
                    setResult({
                        key: queryKey,
                        items: [],
                        pagination: null,
                        error: getErrorMessage(err),
                        at: Date.now(),
                    });
            });
        return () => {
            cancelled = true;
        };
    }, [queryKey, params]);

    useEffect(() => {
        if (!toast) return;
        const t = setTimeout(() => setToast(""), 3000);
        return () => clearTimeout(t);
    }, [toast]);

    const loadMore = async () => {
        setLoadingMore(true);
        try {
            const {data} = await api.get("/work", {
                params: params(result.pagination.page + 1),
            });
            setResult((r) => ({
                ...r,
                items: [...r.items, ...data.items],
                pagination: data.pagination,
            }));
        } catch (err) {
            setToast(getErrorMessage(err));
        } finally {
            setLoadingMore(false);
        }
    };

    const closeModal = useCallback(() => setModal(null), []);
    const refresh = (message) => {
        setModal(null);
        setToast(message);
        setReloadKey((k) => k + 1);
    };

    const {items, pagination, error} = result;
    const hasMore = pagination && pagination.page < pagination.pages;
    const filtered = Boolean(date || category || status || owner);

    return (
        <>
            <header className="emp-head">
                <div className="page-head">
                    <h1>Work Log (Digital Marketing)</h1>
                    <p>
                        {isAdmin
                            ? "Daily work updates from the digital marketing team"
                            : "Everything you've worked on — audits, creatives, campaigns and follow-ups"}
                    </p>
                </div>
                <button
                    type="button"
                    className="button button-primary emp-add"
                    onClick={() => setModal({type: "add"})}
                >
                    <PlusIcon /> {isAdmin ? "Assign Task" : "Add Work"}
                </button>
            </header>

            <div className="lead-toolbar wl-toolbar">
                <input
                    type="date"
                    className="input wl-date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    aria-label="Day"
                    title="Show work logged or closed on this day"
                />
                {date && (
                    <button
                        type="button"
                        className="button button-secondary"
                        onClick={() => setDate("")}
                    >
                        Any day
                    </button>
                )}
                <select
                    className="input"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    aria-label="Type of work"
                >
                    <option value="">All Types</option>
                    {WORK_CATEGORIES.map((c) => (
                        <option key={c.value} value={c.value}>
                            {c.label}
                        </option>
                    ))}
                </select>
                <select
                    className="input"
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    aria-label="Status"
                >
                    <option value="">All Statuses</option>
                    <option value="open">Open (to do / in progress)</option>
                    {Object.entries(WORK_STATUS_LABELS).map(
                        ([value, label]) => (
                            <option key={value} value={value}>
                                {label}
                            </option>
                        ),
                    )}
                </select>
                {isAdmin && (
                    <select
                        className="input"
                        value={owner}
                        onChange={(e) => setOwner(e.target.value)}
                        aria-label="Team member"
                    >
                        <option value="">Everyone</option>
                        {team.map((u) => (
                            <option key={u._id} value={u._id}>
                                {u.firstName} {u.lastName}
                            </option>
                        ))}
                    </select>
                )}
            </div>

            {error ? (
                <div className="alert">{error}</div>
            ) : (
                <section
                    className={`panel ${
                        loading && items.length ? "is-refreshing" : ""
                    }`}
                >
                    <div className="panel-head">
                        <h2>
                            {pagination
                                ? `${pagination.total} item${
                                      pagination.total === 1 ? "" : "s"
                                  }`
                                : "Work"}
                            {date && (
                                <span className="wl-for">
                                    {" "}
                                    · {formatDay(date)}
                                </span>
                            )}
                        </h2>
                    </div>
                    {loading && !pagination ? (
                        <div className="emp-loading">
                            <div className="spinner" />
                        </div>
                    ) : items.length === 0 ? (
                        <p className="panel-empty">
                            {filtered
                                ? "No work matches these filters."
                                : "No work logged yet."}
                        </p>
                    ) : (
                        <div className="att-table-wrap">
                            <table className="att-table lead-table">
                                <thead>
                                    <tr>
                                        <th>Logged</th>
                                        <th>Type</th>
                                        <th>Work</th>
                                        {isAdmin && <th>Team member</th>}
                                        <th>Status</th>
                                        <th>Due</th>
                                        <th>Last update</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {items.map((item) => {
                                        const open =
                                            !CLOSED_WORK_STATUSES.includes(
                                                item.status,
                                            );
                                        const overdue =
                                            open &&
                                            item.dueDate &&
                                            new Date(item.dueDate).getTime() <
                                                result.at;
                                        const last =
                                            item.updates[
                                                item.updates.length - 1
                                            ];
                                        return (
                                            <tr
                                                key={item._id}
                                                tabIndex={0}
                                                onClick={() =>
                                                    setModal({
                                                        type: "edit",
                                                        item,
                                                    })
                                                }
                                                onKeyDown={(e) =>
                                                    e.key === "Enter" &&
                                                    setModal({
                                                        type: "edit",
                                                        item,
                                                    })
                                                }
                                                title="Open this item"
                                            >
                                                <td className="att-muted">
                                                    {formatDay(item.date)}
                                                </td>
                                                <td>
                                                    <CategoryBadge
                                                        category={item.category}
                                                    />
                                                </td>
                                                <td>
                                                    <p className="lead-name">
                                                        {item.title}
                                                    </p>
                                                    <p className="lead-notes-preview">
                                                        {[
                                                            item.client,
                                                            item.assignedBy &&
                                                                `From ${item.assignedBy.firstName}`,
                                                        ]
                                                            .filter(Boolean)
                                                            .join(" · ")}
                                                    </p>
                                                </td>
                                                {isAdmin && (
                                                    <td>
                                                        {item.owner?.firstName}{" "}
                                                        {item.owner?.lastName}
                                                    </td>
                                                )}
                                                <td>
                                                    <WorkStatusPill
                                                        status={item.status}
                                                    />
                                                </td>
                                                <td
                                                    className={
                                                        overdue
                                                            ? "lead-overdue"
                                                            : "att-muted"
                                                    }
                                                >
                                                    {item.dueDate
                                                        ? formatDay(
                                                              item.dueDate.slice(
                                                                  0,
                                                                  10,
                                                              ),
                                                          )
                                                        : "—"}
                                                    {overdue && (
                                                        <small>Overdue</small>
                                                    )}
                                                </td>
                                                <td>
                                                    {last?.note && (
                                                        <p className="wl-note">
                                                            {last.note}
                                                        </p>
                                                    )}
                                                    <p className="att-muted wl-when">
                                                        {formatWhen(
                                                            item.updatedAt,
                                                        )}
                                                    </p>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </section>
            )}

            {hasMore && (
                <div className="emp-more">
                    <button
                        type="button"
                        className="button button-secondary"
                        onClick={loadMore}
                        disabled={loadingMore}
                    >
                        {loadingMore
                            ? "Loading…"
                            : `Load more (${
                                  pagination.total - items.length
                              } left)`}
                    </button>
                </div>
            )}

            {modal?.type === "add" && (
                <Modal
                    title={isAdmin ? "Assign a Task" : "Add Work"}
                    subtitle={
                        isAdmin
                            ? "It will show at the top of their dashboard"
                            : "Log an audit, creative, campaign or follow-up"
                    }
                    onClose={closeModal}
                >
                    <WorkItemForm
                        onSaved={(_i, msg) => refresh(msg)}
                        onCancel={closeModal}
                    />
                </Modal>
            )}

            {modal?.type === "edit" && (
                <Modal
                    title={modal.item.title}
                    subtitle="Status, notes and history"
                    onClose={closeModal}
                >
                    <WorkItemForm
                        item={modal.item}
                        onSaved={(_i, msg) => refresh(msg)}
                        onDeleted={() => refresh("Work item deleted")}
                        onCancel={closeModal}
                    />
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
