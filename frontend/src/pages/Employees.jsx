import { useCallback, useEffect, useState } from "react";
import api, { getErrorMessage } from "../api/client";
import { useAuth } from "../context/useAuth";
import { ROLES, ROLE_LABELS } from "../config";
import Modal from "../components/Modal";
import EmployeeForm from "../components/EmployeeForm";
import BulkUpload from "../components/BulkUpload";
import { PencilIcon, PlusIcon, SearchIcon, TrashIcon, UploadIcon } from "../components/Icons";
import "./Dashboard.css";
import "../components/AttendanceTable.css";
import "./Employees.css";

const PAGE_SIZE = 24;

export default function Employees() {
  const { user: me } = useAuth();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [role, setRole] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  // `key` records which query the data belongs to; a mismatch means we're loading
  const [result, setResult] = useState({ key: null, users: [], pagination: null, error: "" });
  const [loadingMore, setLoadingMore] = useState(false);
  const [modal, setModal] = useState(null); // { type: "add" | "edit" | "delete", employee? }
  const [toast, setToast] = useState("");

  const queryKey = `${debouncedSearch}|${role}|${reloadKey}`;
  const loading = result.key !== queryKey;

  // Wait until typing pauses before searching
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    api
      .get("/users", {
        params: { search: debouncedSearch || undefined, role: role || undefined, limit: PAGE_SIZE },
      })
      .then(({ data }) => {
        if (!cancelled) {
          setResult({ key: queryKey, users: data.users, pagination: data.pagination, error: "" });
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setResult({ key: queryKey, users: [], pagination: null, error: getErrorMessage(err) });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [queryKey, debouncedSearch, role]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const { data } = await api.get("/users", {
        params: {
          search: debouncedSearch || undefined,
          role: role || undefined,
          limit: PAGE_SIZE,
          page: result.pagination.page + 1,
        },
      });
      setResult((r) => ({ ...r, users: [...r.users, ...data.users], pagination: data.pagination }));
    } catch (err) {
      setToast(getErrorMessage(err));
    } finally {
      setLoadingMore(false);
    }
  };

  const closeModal = useCallback(() => setModal(null), []);

  const handleSaved = (_user, message) => {
    setModal(null);
    setToast(message);
    setReloadKey((k) => k + 1);
  };

  const { users, pagination, error } = result;
  const hasMore = pagination && pagination.page < pagination.pages;

  return (
    <>
      <header className="emp-head">
        <div className="page-head">
          <h1>Employees</h1>
          <p>Manage your team members</p>
        </div>
        <div className="emp-head-actions">
          <button
            type="button"
            className="button button-secondary"
            onClick={() => setModal({ type: "bulk" })}
          >
            <UploadIcon /> Bulk Upload
          </button>
          <button
            type="button"
            className="button button-primary emp-add"
            onClick={() => setModal({ type: "add" })}
          >
            <PlusIcon /> Add Employee
          </button>
        </div>
      </header>

      <div className="emp-toolbar">
        <div className="emp-search">
          <SearchIcon />
          <input
            className="input"
            type="search"
            placeholder="Search by name, email or phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search employees"
          />
        </div>
        <select
          className="input emp-filter"
          value={role}
          onChange={(e) => setRole(e.target.value)}
          aria-label="Filter by role"
        >
          <option value="">All Roles</option>
          {Object.values(ROLES).map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </select>
      </div>

      {error ? (
        <div className="alert">{error}</div>
      ) : loading && users.length === 0 ? (
        <div className="emp-loading">
          <div className="spinner" />
        </div>
      ) : (
        <>
          <div className={`emp-grid ${loading ? "is-refreshing" : ""}`}>
            {users.length === 0 ? (
              <p className="emp-empty">No employees found</p>
            ) : (
              users.map((u) => (
                <EmployeeCard
                  key={u._id}
                  employee={u}
                  isSelf={u._id === me._id}
                  onEdit={() => setModal({ type: "edit", employee: u })}
                  onDelete={() => setModal({ type: "delete", employee: u })}
                />
              ))
            )}
          </div>

          {hasMore && (
            <div className="emp-more">
              <button
                type="button"
                className="button button-secondary"
                onClick={loadMore}
                disabled={loadingMore}
              >
                {loadingMore ? "Loading…" : `Load more (${pagination.total - users.length} left)`}
              </button>
            </div>
          )}
        </>
      )}

      {modal?.type === "add" && (
        <Modal
          title="Add New Employee"
          subtitle="Create a user account for a team member"
          onClose={closeModal}
        >
          <EmployeeForm onSaved={handleSaved} onCancel={closeModal} />
        </Modal>
      )}

      {modal?.type === "edit" && (
        <Modal title="Edit Employee" subtitle="Update employee details" onClose={closeModal}>
          <EmployeeForm
            employee={modal.employee}
            isSelf={modal.employee._id === me._id}
            onSaved={handleSaved}
            onCancel={closeModal}
          />
        </Modal>
      )}

      {modal?.type === "bulk" && (
        <Modal
          title="Bulk Upload Employees"
          subtitle="Create many accounts at once from a CSV file"
          onClose={closeModal}
        >
          <BulkUpload
            onCancel={closeModal}
            onDone={(created) => {
              setModal(null);
              if (created) {
                setToast(`${created} employee${created === 1 ? "" : "s"} added`);
                setReloadKey((k) => k + 1);
              }
            }}
          />
        </Modal>
      )}

      {modal?.type === "delete" && (
        <DeleteDialog employee={modal.employee} onClose={closeModal} onDeleted={handleSaved} />
      )}

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </>
  );
}

function EmployeeCard({ employee, isSelf, onEdit, onDelete }) {
  const { firstName, lastName, email, role } = employee;

  return (
    <article className="emp-card">
      <div className="emp-cover">
        <span className="emp-initials">
          {firstName[0]} {lastName[0]}
        </span>
      </div>

      <div className="emp-badges">
        <span className="emp-badge">{ROLE_LABELS[role]}</span>
        {isSelf && <span className="emp-badge emp-badge-you">You</span>}
      </div>

      <div className="emp-actions">
        <button type="button" onClick={onEdit} aria-label={`Edit ${firstName} ${lastName}`}>
          <PencilIcon />
        </button>
        {!isSelf && (
          <button
            type="button"
            className="is-danger"
            onClick={onDelete}
            aria-label={`Delete ${firstName} ${lastName}`}
          >
            <TrashIcon />
          </button>
        )}
      </div>

      <div className="emp-info">
        <h3>
          {firstName} {lastName}
        </h3>
        <p>{email}</p>
      </div>
    </article>
  );
}

function DeleteDialog({ employee, onClose, onDeleted }) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const name = `${employee.firstName} ${employee.lastName}`;

  const handleDelete = async () => {
    setDeleting(true);
    setError("");
    try {
      await api.delete(`/users/${employee._id}`);
      onDeleted(employee, `${name} was deleted`);
    } catch (err) {
      setError(getErrorMessage(err));
      setDeleting(false);
    }
  };

  return (
    <Modal title="Delete employee?" size="sm" onClose={onClose}>
      <p className="emp-confirm-text">
        <strong>{name}</strong> will lose access immediately. This can't be undone.
      </p>
      {error && <div className="alert emp-confirm-error">{error}</div>}
      <div className="form-actions">
        <button type="button" className="button button-secondary" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="button button-danger"
          onClick={handleDelete}
          disabled={deleting}
        >
          {deleting ? "Deleting…" : "Delete"}
        </button>
      </div>
    </Modal>
  );
}
