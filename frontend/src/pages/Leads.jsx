import {useCallback, useEffect, useState} from "react";
import api, {getErrorMessage} from "../api/client";
import {useAuth} from "../context/useAuth";
import {
    CALL_STATUSES,
    CLOSED_STATUSES,
    LEAD_SOURCES,
    ROLES,
    SOURCE_LABELS,
} from "../config";
import Modal from "../components/Modal";
import LeadForm from "../components/LeadForm";
import {CallStatusPill, ContactLinks} from "../components/LeadBits";
import {PlusIcon, SearchIcon, UploadIcon} from "../components/Icons";
import {AssignSheetForm, LeadSheetsPanel} from "../components/LeadSheets";
import {formatWhen} from "../utils/format";
import "./Dashboard.css";
import "./Employees.css";
import "../components/AttendanceTable.css";
import "./Leads.css";

const PAGE_SIZE = 25;

export default function Leads() {
    const {user} = useAuth();
    const isAdmin = user.role === ROLES.ADMIN;
    const [search, setSearch] = useState("");
    const [debounced, setDebounced] = useState("");
    const [status, setStatus] = useState("");
    const [source, setSource] = useState("");
    const [reloadKey, setReloadKey] = useState(0);
    const [result, setResult] = useState({
        key: null,
        leads: [],
        pagination: null,
        error: "",
        at: 0,
    });
    const [loadingMore, setLoadingMore] = useState(false);
    const [modal, setModal] = useState(null); // { type: "add" } | { type: "edit", lead } | { type: "sheet" }
    const [sheetsKey, setSheetsKey] = useState(0); // reloads the sheet list after assigning
    const [toast, setToast] = useState("");

    const queryKey = `${debounced}|${status}|${source}|${reloadKey}`;
    const loading = result.key !== queryKey;
    const params = useCallback(
        (page = 1) => ({
            search: debounced || undefined,
            status: status || undefined,
            source: source || undefined,
            limit: PAGE_SIZE,
            page,
        }),
        [debounced, status, source],
    );

    useEffect(() => {
        const t = setTimeout(() => setDebounced(search.trim()), 300);
        return () => clearTimeout(t);
    }, [search]);

    useEffect(() => {
        let cancelled = false;
        api.get("/leads", {params: params()})
            .then(({data}) => {
                if (!cancelled) {
                    setResult({
                        key: queryKey,
                        leads: data.leads,
                        pagination: data.pagination,
                        error: "",
                        at: Date.now(),
                    });
                }
            })
            .catch((err) => {
                if (!cancelled) {
                    setResult({
                        key: queryKey,
                        leads: [],
                        pagination: null,
                        error: getErrorMessage(err),
                        at: Date.now(),
                    });
                }
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
            const {data} = await api.get("/leads", {
                params: params(result.pagination.page + 1),
            });
            setResult((r) => ({
                ...r,
                leads: [...r.leads, ...data.leads],
                pagination: data.pagination,
            }));
        } catch (err) {
            setToast(getErrorMessage(err));
        } finally {
            setLoadingMore(false);
        }
    };

    const closeModal = useCallback(() => setModal(null), []);

    const handleSaved = (_lead, message, {addAnother} = {}) => {
        setToast(message);
        setReloadKey((k) => k + 1);
        if (!addAnother) setModal(null);
    };

    const {leads, pagination, error} = result;
    const hasMore = pagination && pagination.page < pagination.pages;
    const filtered = Boolean(debounced || status || source);

    return (
        <>
            <header className="emp-head">
                <div className="page-head">
                    <h1>Leads (Tellecaller)</h1>
                    <p>
                        {isAdmin
                            ? "Every lead in the system and who it's locked to"
                            : "Leads you add are locked to you — nobody else can add the same number"}
                    </p>
                </div>
                {!isAdmin && (
                    <button
                        type="button"
                        className="button button-primary emp-add"
                        onClick={() => setModal({type: "add"})}
                    >
                        <PlusIcon /> Add Lead
                    </button>
                )}
                {isAdmin && (
                    <button
                        type="button"
                        className="button button-primary emp-add"
                        onClick={() => setModal({type: "sheet"})}
                    >
                        <UploadIcon /> Assign Excel Sheet
                    </button>
                )}
            </header>

            <LeadSheetsPanel isAdmin={isAdmin} reloadKey={sheetsKey} onToast={setToast} />

            <div className="lead-toolbar">
                <div className="emp-search">
                    <SearchIcon />
                    <input
                        className="input"
                        type="search"
                        placeholder="Search by business name or number..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        aria-label="Search leads"
                    />
                </div>
                <select
                    className="input"
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    aria-label="Filter by call status"
                >
                    <option value="">All Statuses</option>
                    {CALL_STATUSES.map((s) => (
                        <option key={s.value} value={s.value}>
                            {s.label}
                        </option>
                    ))}
                </select>
                <select
                    className="input"
                    value={source}
                    onChange={(e) => setSource(e.target.value)}
                    aria-label="Filter by source"
                >
                    <option value="">All Sources</option>
                    {LEAD_SOURCES.map((s) => (
                        <option key={s.value} value={s.value}>
                            {s.label}
                        </option>
                    ))}
                </select>
            </div>

            {error ? (
                <div className="alert">{error}</div>
            ) : (
                <section
                    className={`panel ${
                        loading && leads.length ? "is-refreshing" : ""
                    }`}
                >
                    <div className="panel-head">
                        <h2>
                            {pagination
                                ? `${pagination.total} lead${
                                      pagination.total === 1 ? "" : "s"
                                  }`
                                : "Leads"}
                        </h2>
                    </div>
                    {loading && !pagination ? (
                        <div className="emp-loading">
                            <div className="spinner" />
                        </div>
                    ) : leads.length === 0 ? (
                        <p className="panel-empty">
                            {filtered
                                ? "No leads match these filters."
                                : isAdmin
                                ? "No leads yet. Telecallers add them from their Leads page."
                                : "No leads yet. Click “Add Lead” to add your first one."}
                        </p>
                    ) : (
                        <div className="att-table-wrap">
                            <table className="att-table lead-table">
                                <thead>
                                    <tr>
                                        <th>Business</th>
                                        <th>Phone</th>
                                        <th>Source</th>
                                        <th>Status</th>
                                        <th>Next follow-up</th>
                                        {isAdmin && <th>Locked to</th>}
                                        <th>Updated</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {leads.map((lead) => {
                                        const overdue =
                                            lead.followUpAt &&
                                            !CLOSED_STATUSES.includes(
                                                lead.callStatus,
                                            ) &&
                                            new Date(
                                                lead.followUpAt,
                                            ).getTime() < result.at;
                                        return (
                                            <tr
                                                key={lead._id}
                                                tabIndex={0}
                                                onClick={() =>
                                                    setModal({
                                                        type: "edit",
                                                        lead,
                                                    })
                                                }
                                                onKeyDown={(e) =>
                                                    e.key === "Enter" &&
                                                    setModal({
                                                        type: "edit",
                                                        lead,
                                                    })
                                                }
                                                title="Update this lead"
                                            >
                                                <td>
                                                    <p className="lead-name">
                                                        {lead.businessName}
                                                    </p>
                                                    {lead.notes && (
                                                        <p className="lead-notes-preview">
                                                            {lead.notes}
                                                        </p>
                                                    )}
                                                </td>
                                                <td>
                                                    <ContactLinks
                                                        phone={lead.phone}
                                                    />
                                                </td>
                                                <td>
                                                    {SOURCE_LABELS[lead.source]}
                                                </td>
                                                <td>
                                                    <CallStatusPill
                                                        status={lead.callStatus}
                                                    />
                                                </td>
                                                <td
                                                    className={
                                                        overdue
                                                            ? "lead-overdue"
                                                            : ""
                                                    }
                                                >
                                                    {lead.followUpAt ? (
                                                        formatWhen(
                                                            lead.followUpAt,
                                                        )
                                                    ) : (
                                                        <span className="att-muted">
                                                            —
                                                        </span>
                                                    )}
                                                    {overdue && (
                                                        <small>Overdue</small>
                                                    )}
                                                </td>
                                                {isAdmin && (
                                                    <td>
                                                        {lead.owner?.firstName}{" "}
                                                        {lead.owner?.lastName}
                                                    </td>
                                                )}
                                                <td className="att-muted">
                                                    {formatWhen(lead.updatedAt)}
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
                                  pagination.total - leads.length
                              } left)`}
                    </button>
                </div>
            )}

            {modal?.type === "add" && (
                <Modal
                    title="Add Lead"
                    subtitle="It will be locked to you once saved"
                    onClose={closeModal}
                >
                    <LeadForm onSaved={handleSaved} onCancel={closeModal} />
                </Modal>
            )}

            {modal?.type === "edit" && (
                <Modal
                    title={modal.lead.businessName}
                    subtitle="Update the call and next follow-up"
                    onClose={closeModal}
                >
                    <LeadForm
                        lead={modal.lead}
                        onSaved={handleSaved}
                        onCancel={closeModal}
                    />
                </Modal>
            )}

            {modal?.type === "sheet" && (
                <Modal
                    title="Assign Excel Sheet"
                    subtitle="Send a lead sheet to one telecaller"
                    size="md"
                    onClose={closeModal}
                >
                    <AssignSheetForm
                        onCancel={closeModal}
                        onSaved={(message) => {
                            setModal(null);
                            setToast(message);
                            setSheetsKey((k) => k + 1);
                        }}
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
