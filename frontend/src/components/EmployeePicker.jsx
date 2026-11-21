import { useState } from "react";
import { ROLES, ROLE_LABELS } from "../config";
import "./TaskBits.css";

const TEAMS = [
  { role: ROLES.TELECALLER, label: "All Telecallers" },
  { role: ROLES.DIGITAL_MARKETING, label: "All Digital Marketing" },
];

// Searchable checklist of employees with "whole team" shortcuts.
// team: users (null while loading); value: selected ids; onChange(ids)
export default function EmployeePicker({ team, value, onChange, hasError = false, emptyText = "No active employees yet." }) {
  const [search, setSearch] = useState("");

  const toggle = (id) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  const selectGroup = (ids) => {
    const allIn = ids.every((id) => value.includes(id));
    onChange(allIn ? value.filter((id) => !ids.includes(id)) : [...new Set([...value, ...ids])]);
  };

  const q = search.trim().toLowerCase();
  const visible = (team ?? []).filter((u) => !q || `${u.firstName} ${u.lastName}`.toLowerCase().includes(q));

  return (
    <div className={`task-picker ${hasError ? "has-error" : ""}`}>
      <div className="task-picker-top">
        <input
          className="input"
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search employees…"
          aria-label="Search employees"
        />
        <div className="task-picker-groups">
          {TEAMS.map(({ role, label }) => {
            const ids = (team ?? []).filter((u) => u.role === role).map((u) => u._id);
            if (!ids.length) return null;
            const allIn = ids.every((id) => value.includes(id));
            return (
              <button key={role} type="button" className={`chip ${allIn ? "is-active" : ""}`} onClick={() => selectGroup(ids)}>
                {label}
              </button>
            );
          })}
        </div>
      </div>
      {!team ? (
        <p className="task-picker-empty">Loading employees…</p>
      ) : visible.length === 0 ? (
        <p className="task-picker-empty">{team.length ? "No match." : emptyText}</p>
      ) : (
        <ul className="task-picker-list">
          {visible.map((u) => (
            <li key={u._id}>
              <label className={value.includes(u._id) ? "is-picked" : ""}>
                <input type="checkbox" checked={value.includes(u._id)} onChange={() => toggle(u._id)} />
                <span className="person-avatar">{u.firstName[0]}</span>
                <span className="task-picker-name">
                  {u.firstName} {u.lastName}
                  <small>
                    {ROLE_LABELS[u.role]}
                    {u.isActive === false ? " · deactivated" : ""}
                  </small>
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
