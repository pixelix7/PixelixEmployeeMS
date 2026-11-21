import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import api, { getErrorMessage } from "../api/client";
import { useAuth } from "../context/useAuth";
import { CLIENT_STATUSES, ROLES } from "../config";
import { formatDate, formatPhone } from "../utils/format";
import Modal from "../components/Modal";
import ClientForm from "../components/ClientForm";
import EmployeePicker from "../components/EmployeePicker";
import { ClientDetail, ClientStatusPill, ContractEnd } from "../components/ClientBits";
import { ClientProjects } from "../components/ProjectBits";
import { PlusIcon, SearchIcon } from "../components/Icons";
import "../components/AttendanceTable.css";
import "./Employees.css";
import "./Attendance.css";
import "./Clients.css";

const TABS = [{ value: "", label: "All" }, ...CLIENT_STATUSES];

// Keyed by URL so "loading" is derived (no setState in the effect body)
function useClients(url) {
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

export default function Clients() {
  const { user } = useAuth();
  const isAdmin = user.role === ROLES.ADMIN;
  const [params, setParams] = useSearchParams();
  const status = CLIENT_STATUSES.some((s) => s.value === params.get("status")) ? params.get("status") : "";
  const assignee = isAdmin ? params.get("assignee") || "" : "";
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [reload, setReload] = useState(0);
  const [team, setTeam] = useState([]);
  const [selected, setSelected] = useState([]); // client ids for bulk assign
  const [modal, setModal] = useState(null); // { mode: "new" | "view" | "edit" | "assign", client? }
  const [toast, setToast] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setQuery(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (!isAdmin) return;
    api
      .get("/users", { params: { limit: 100 } })
      .then(({ data }) => setTeam(data.users.filter((u) => u.role !== ROLES.ADMIN)))
      .catch(() => setTeam([]));
  }, [isAdmin]);

  const qs = new URLSearchParams({ limit: 100, r: reload });
  if (status) qs.set("status", status);
  if (assignee) qs.set("assignee", assignee);
  if (query) qs.set("q", query);
  const { data, error, loading } = useClients(`/clients?${qs}`);

  const update = (changes) => {
    const next = { status, assignee, ...changes };
    setParams(Object.fromEntries(Object.entries(next).filter(([, v]) => v)), { replace: true });
    setSelected([]);
  };

  const done = (message) => {
    setModal(null);
    setToast(message);
    setSelected([]);
    setReload((r) => r + 1);
  };

  // Opening a client loads its full record (with history)
  const open = async (id) => {
    try {
      const { data } = await api.get(`/clients/${id}`);
      setModal({ mode: "view", client: data.client });
    } catch (err) {
      setToast(getErrorMessage(err));
    }
  };

  const clients = data?.clients ?? [];
  const counts = data?.counts ?? {};
  const allSelected = clients.length > 0 && clients.every((c) => selected.includes(c._id));
  const toggle = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <>
      <header className="att-head">
        <div className="page-head">
          <h1>{isAdmin ? "Clients" : "My Clients"}</h1>
          <p>{isAdmin ? "Every client, their contract and who handles them" : "Clients the admin has assigned to you"}</p>
        </div>
        {isAdmin && (
          <button type="button" className="button button-primary" onClick={() => setModal({ mode: "new" })}>
            <PlusIcon /> Add Client
          </button>
        )}
      </header>

      <div className="task-toolbar client-toolbar">
        <div className="att-tabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.value || "all"}
              type="button"
              role="tab"
              aria-selected={status === t.value}
              className={status === t.value ? "is-active" : ""}
              onClick={() => update({ status: t.value })}
            >
              {t.label}
              <span className="client-count">{counts[t.value || "all"] ?? 0}</span>
            </button>
          ))}
        </div>
        <div className="client-filters">
          {isAdmin && (
            <select className="input" value={assignee} onChange={(e) => update({ assignee: e.target.value })} aria-label="Filter by employee">
              <option value="">Everyone's clients</option>
              <option value="unassigned">Unassigned{data?.unassigned ? ` (${data.unassigned})` : ""}</option>
              {team.map((u) => (
                <option key={u._id} value={u._id}>
                  {u.firstName} {u.lastName}
                  {u.isActive === false ? " (deactivated)" : ""}
                </option>
              ))}
            </select>
          )}
          <div className="emp-search client-search">
            <SearchIcon />
            <input
              className="input"
              type="search"
              placeholder="Name, phone, email, contract no…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search clients"
            />
          </div>
        </div>
      </div>

      {isAdmin && data?.unassigned > 0 && assignee !== "unassigned" && (
        <button type="button" className="notice client-notice" onClick={() => update({ assignee: "unassigned" })}>
          {data.unassigned} client{data.unassigned === 1 ? " isn't" : "s aren't"} assigned to anyone yet — view them
        </button>
      )}

      {error && <div className="alert client-alert">{error}</div>}

      <section className={`panel ${loading && data ? "is-refreshing" : ""}`}>
        {!data ? (
          <p className="panel-empty">{error ? "" : "Loading…"}</p>
        ) : clients.length === 0 ? (
          <p className="panel-empty">
            {query
              ? "No clients match your search."
              : isAdmin
                ? "No clients here yet. Use “Add Client” to create one."
                : "No clients have been assigned to you yet."}
          </p>
        ) : (
          <div className="att-table-wrap">
            <table className="att-table client-table">
              <thead>
                <tr>
                  {isAdmin && (
                    <th className="client-check">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={() => setSelected(allSelected ? [] : clients.map((c) => c._id))}
                        aria-label="Select all clients"
                      />
                    </th>
                  )}
                  <th>Client</th>
                  <th>Contact</th>
                  <th>Contract</th>
                  <th className="client-col-joined">Joined</th>
                  {isAdmin && <th>Assigned to</th>}
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((c) => (
                  <tr key={c._id} className={`client-row ${selected.includes(c._id) ? "is-selected" : ""}`} onClick={() => open(c._id)}>
                    {isAdmin && (
                      <td className="client-check" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selected.includes(c._id)}
                          onChange={() => toggle(c._id)}
                          aria-label={`Select ${c.name}`}
                        />
                      </td>
                    )}
                    <td>
                      <span className="client-name">{c.name}</span>
                      <span className="att-muted client-sub">
                        {[c.contactPerson, c.city].filter(Boolean).join(" · ") || c.industry || "—"}
                      </span>
                    </td>
                    <td>
                      <span className="client-phone">{formatPhone(c.phone)}</span>
                      {c.email && <span className="att-muted client-sub">{c.email}</span>}
                    </td>
                    <td>
                      {c.contractNumber || <span className="att-muted">—</span>}
                      <ContractEnd end={c.contractEnd} />
                    </td>
                    <td className="att-date client-col-joined">{formatDate(c.joinedOn)}</td>
                    {isAdmin && (
                      <td>
                        {c.assignedTo.length === 0 ? (
                          <span className="client-none">Unassigned</span>
                        ) : (
                          <span className="client-avatars" title={c.assignedTo.map((u) => `${u.firstName} ${u.lastName}`).join(", ")}>
                            {c.assignedTo.slice(0, 3).map((u) => (
                              <span key={u._id} className="person-avatar">
                                {u.firstName[0]}
                              </span>
                            ))}
                            <span className="client-names">
                              {c.assignedTo.length === 1
                                ? `${c.assignedTo[0].firstName} ${c.assignedTo[0].lastName}`
                                : `${c.assignedTo[0].firstName} +${c.assignedTo.length - 1}`}
                            </span>
                          </span>
                        )}
                      </td>
                    )}
                    <td>
                      <ClientStatusPill status={c.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && data.pagination.total > clients.length && (
          <p className="panel-empty client-more">
            Showing {clients.length} of {data.pagination.total}. Search or filter to narrow it down.
          </p>
        )}
      </section>

      {/* Bulk assign bar */}
      {isAdmin && selected.length > 0 && (
        <div className="client-bulk" role="region" aria-label="Selected clients">
          <span>
            <strong>{selected.length}</strong> selected
          </span>
          <button type="button" className="button button-primary" onClick={() => setModal({ mode: "assign" })}>
            Assign to…
          </button>
          <button type="button" className="client-bulk-clear" onClick={() => setSelected([])}>
            Clear
          </button>
        </div>
      )}

      {modal?.mode === "new" && (
        <Modal title="Add Client" subtitle="Client details, contract and who handles it" onClose={() => setModal(null)}>
          <ClientForm onSaved={(_c, message) => done(message)} onCancel={() => setModal(null)} />
        </Modal>
      )}
      {modal?.mode === "edit" && (
        <Modal title={`Edit ${modal.client.name}`} onClose={() => setModal(null)}>
          <ClientForm client={modal.client} onSaved={(_c, message) => done(message)} onCancel={() => setModal(null)} />
        </Modal>
      )}
      {modal?.mode === "view" && (
        <Modal title={modal.client.name} subtitle={modal.client.industry || undefined} onClose={() => setModal(null)}>
          <ClientDetail
            client={modal.client}
            isAdmin={isAdmin}
            extra={isAdmin && <ClientProjects clientId={modal.client._id} />}
            actions={
              isAdmin ? (
                <ViewActions
                  client={modal.client}
                  onEdit={() => setModal({ mode: "edit", client: modal.client })}
                  onDeleted={() => done("Client deleted")}
                  onClose={() => setModal(null)}
                />
              ) : (
                <button type="button" className="button button-secondary" onClick={() => setModal(null)}>
                  Close
                </button>
              )
            }
          />
        </Modal>
      )}
      {modal?.mode === "assign" && (
        <Modal title={`Assign ${selected.length} client${selected.length === 1 ? "" : "s"}`} size="md" onClose={() => setModal(null)}>
          <BulkAssign clientIds={selected} team={team.filter((u) => u.isActive !== false)} onDone={done} onCancel={() => setModal(null)} />
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

function ViewActions({ client, onEdit, onDeleted, onClose }) {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const remove = async () => {
    setBusy(true);
    try {
      await api.delete(`/clients/${client._id}`);
      onDeleted();
    } catch (err) {
      setError(getErrorMessage(err));
      setBusy(false);
    }
  };

  return (
    <>
      {error && <span className="form-error client-action-error">{error}</span>}
      {confirm ? (
        <span className="task-delete-confirm">
          Delete {client.name}?
          <button type="button" className="button button-danger" onClick={remove} disabled={busy}>
            Delete
          </button>
          <button type="button" className="button button-secondary" onClick={() => setConfirm(false)}>
            Keep
          </button>
        </span>
      ) : (
        <button type="button" className="task-delete" onClick={() => setConfirm(true)}>
          Delete client
        </button>
      )}
      <button type="button" className="button button-secondary" onClick={onClose}>
        Close
      </button>
      <button type="button" className="button button-primary" onClick={onEdit}>
        Edit Client
      </button>
    </>
  );
}

function BulkAssign({ clientIds, team, onDone, onCancel }) {
  const [userIds, setUserIds] = useState([]);
  const [mode, setMode] = useState("add");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const { data } = await api.post("/clients/assign", { clientIds, userIds, mode });
      onDone(data.message);
    } catch (err) {
      setError(getErrorMessage(err));
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit}>
      {error && (
        <div className="alert" role="alert">
          {error}
        </div>
      )}
      <EmployeePicker team={team} value={userIds} onChange={setUserIds} />
      <div className="client-modes" role="radiogroup" aria-label="How to assign">
        <label>
          <input type="radio" name="mode" checked={mode === "add"} onChange={() => setMode("add")} />
          <span>
            Add to current team
            <small>Keeps whoever already handles these clients</small>
          </span>
        </label>
        <label>
          <input type="radio" name="mode" checked={mode === "replace"} onChange={() => setMode("replace")} />
          <span>
            Replace current team
            <small>Only the people picked above will handle them{userIds.length === 0 ? " (none = unassign)" : ""}</small>
          </span>
        </label>
      </div>
      <div className="form-actions">
        <button type="button" className="button button-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="button button-primary" disabled={saving || (mode === "add" && userIds.length === 0)}>
          {saving ? "Saving…" : mode === "replace" && userIds.length === 0 ? "Unassign" : "Assign"}
        </button>
      </div>
    </form>
  );
}
