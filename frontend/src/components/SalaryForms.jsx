import { useEffect, useState } from "react";
import api, { getErrorMessage } from "../api/client";
import { PAYMENT_MODES, PAYMENT_MODE_LABELS } from "../config";
import { formatDate, formatMoney, formatMonth, formatWhen, todayKey } from "../utils/format";
import { PlusIcon, TrashIcon } from "./Icons";
import "./EmployeeForm.css";
import "./LeadForm.css";
import "./SalaryForms.css";

const toNumber = (v) => (v === "" || v == null || Number.isNaN(Number(v)) ? 0 : Number(v));
const total = (lines) => lines.reduce((n, l) => n + toNumber(l.amount), 0);

// Editable list of { title, amount } rows (incentives or deductions)
function Lines({ label, lines, onChange, placeholder, addLabel, errors, prefix }) {
  const update = (i, field, value) => onChange(lines.map((l, j) => (j === i ? { ...l, [field]: value } : l)));
  return (
    <div className="sal-lines">
      <div className="sal-lines-head">
        <span>{label}</span>
        <strong>{formatMoney(total(lines))}</strong>
      </div>
      {lines.length === 0 && <p className="sal-lines-empty">None</p>}
      {lines.map((l, i) => (
        <div key={i} className="sal-line">
          <input
            className={`input ${errors[`${prefix}.${i}.title`] ? "has-error" : ""}`}
            value={l.title}
            onChange={(e) => update(i, "title", e.target.value)}
            placeholder={placeholder}
            maxLength={120}
            aria-label={`${label} ${i + 1} description`}
          />
          <div className="sal-amount">
            <span>₹</span>
            <input
              className={`input ${errors[`${prefix}.${i}.amount`] ? "has-error" : ""}`}
              type="number"
              min={0}
              inputMode="numeric"
              value={l.amount}
              onChange={(e) => update(i, "amount", e.target.value)}
              placeholder="0"
              aria-label={`${label} ${i + 1} amount`}
            />
          </div>
          <button
            type="button"
            className="sal-line-remove"
            onClick={() => onChange(lines.filter((_, j) => j !== i))}
            aria-label={`Remove ${label.toLowerCase()} ${i + 1}`}
          >
            <TrashIcon width={16} height={16} />
          </button>
        </div>
      ))}
      <button type="button" className="sal-add" onClick={() => onChange([...lines, { title: "", amount: "" }])}>
        <PlusIcon width={14} height={14} /> {addLabel}
      </button>
    </div>
  );
}

// Create or edit one month's salary for one employee
export function SalaryForm({ row, month, onSaved, onDeleted, onCancel }) {
  const record = row.record;
  const isEdit = Boolean(record);
  const [values, setValues] = useState(() => ({
    baseSalary: record?.baseSalary ?? row.suggestedBase ?? "",
    incentives: record?.incentives?.map((l) => ({ ...l })) ?? [],
    deductions: record?.deductions?.map((l) => ({ ...l })) ?? [],
    notes: record?.notes ?? "",
    status: record?.status ?? "pending",
    paidOn: record?.paidOn ?? todayKey(),
    paymentMode: record?.paymentMode ?? "bank_transfer",
    reference: record?.reference ?? "",
  }));
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const set = (field, value) => {
    setValues((v) => ({ ...v, [field]: value }));
    setErrors({});
    setFormError("");
  };

  const net = toNumber(values.baseSalary) + total(values.incentives) - total(values.deductions);
  const a = row.attendance;

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    setFormError("");
    const payload = {
      ...values,
      // Drop empty rows instead of failing on them
      incentives: values.incentives.filter((l) => l.title.trim() || toNumber(l.amount)),
      deductions: values.deductions.filter((l) => l.title.trim() || toNumber(l.amount)),
      ...(values.status === "pending" && { paidOn: "", paymentMode: "" }),
    };
    try {
      const { data } = isEdit
        ? await api.patch(`/salaries/${record._id}`, payload)
        : await api.post("/salaries", { ...payload, user: row.user._id, month });
      onSaved(data.message);
    } catch (err) {
      const fieldErrors = err.response?.data?.errors;
      if (fieldErrors) {
        setErrors(fieldErrors);
        setFormError(Object.values(fieldErrors)[0]);
      } else setFormError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setSaving(true);
    try {
      await api.delete(`/salaries/${record._id}`);
      onDeleted();
    } catch (err) {
      setFormError(getErrorMessage(err));
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

      {a && (
        <p className="sal-att">
          Attendance in {formatMonth(month)}: <strong>{a.present}</strong> present · <strong>{a.absent}</strong> absent ·{" "}
          {a.halfDays} half day{a.halfDays === 1 ? "" : "s"} · {a.leaveDays} leave · {a.late} late
          {a.rate != null && <> · <strong>{a.rate}%</strong></>}
        </p>
      )}

      <div className="form-field">
        <label htmlFor="sal-base">Base salary (₹)</label>
        <div className="sal-amount sal-base">
          <span>₹</span>
          <input
            id="sal-base"
            className={`input ${errors.baseSalary ? "has-error" : ""}`}
            type="number"
            min={0}
            inputMode="numeric"
            value={values.baseSalary}
            onChange={(e) => set("baseSalary", e.target.value)}
            placeholder="e.g. 18000"
            autoFocus={!isEdit}
          />
        </div>
        {!isEdit && row.suggestedBase != null && <p className="form-hint">Filled in from their last salary record.</p>}
      </div>

      <Lines
        label="Incentives"
        prefix="incentives"
        lines={values.incentives}
        onChange={(v) => set("incentives", v)}
        placeholder="e.g. 8 conversions × ₹500, Diwali bonus"
        addLabel="Add incentive"
        errors={errors}
      />
      <Lines
        label="Deductions"
        prefix="deductions"
        lines={values.deductions}
        onChange={(v) => set("deductions", v)}
        placeholder="e.g. 2 days unpaid leave, salary advance"
        addLabel="Add deduction"
        errors={errors}
      />

      <div className={`sal-net ${net < 0 ? "is-negative" : ""}`}>
        <span>Net pay</span>
        <strong>{formatMoney(net)}</strong>
      </div>

      <div className="form-field sal-field">
        <label>Payment</label>
        <div className="chip-row" role="radiogroup" aria-label="Payment status">
          {[
            ["pending", "Pending"],
            ["paid", "Paid"],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={values.status === value}
              className={`chip ${values.status === value ? "is-active" : ""}`}
              onClick={() => set("status", value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {values.status === "paid" && <PaymentFields values={values} set={set} errors={errors} />}

      <div className="form-field sal-field">
        <label htmlFor="sal-notes">Notes (optional)</label>
        <textarea
          id="sal-notes"
          className="input lead-notes"
          rows={2}
          maxLength={1000}
          value={values.notes}
          onChange={(e) => set("notes", e.target.value)}
          placeholder="Anything to remember about this month's pay"
        />
      </div>

      {isEdit && record.history?.length > 0 && (
        <div className="sal-history">
          <p className="sal-history-title">History</p>
          <ol>
            {[...record.history].reverse().map((h, i) => (
              <li key={i}>
                <span>{h.note}</span>
                <small>
                  {h.by ? `${h.by.firstName} ${h.by.lastName}` : "Someone"} · {formatWhen(h.at)}
                </small>
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="form-actions sal-actions">
        {isEdit &&
          (confirmDelete ? (
            <span className="sal-delete-confirm">
              Delete this record?
              <button type="button" className="button button-danger" onClick={remove} disabled={saving}>
                Delete
              </button>
              <button type="button" className="button button-secondary" onClick={() => setConfirmDelete(false)}>
                Keep
              </button>
            </span>
          ) : (
            <button type="button" className="sal-delete" onClick={() => setConfirmDelete(true)}>
              Delete record
            </button>
          ))}
        <button type="button" className="button button-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="button button-primary" disabled={saving || values.baseSalary === ""}>
          {saving ? "Saving…" : isEdit ? "Save Changes" : "Add Salary Record"}
        </button>
      </div>
    </form>
  );
}

function PaymentFields({ values, set, errors }) {
  return (
    <div className="form-grid sal-pay">
      <div className="form-field">
        <label htmlFor="sal-paid-on">Paid on</label>
        <input
          id="sal-paid-on"
          type="date"
          className={`input ${errors.paidOn ? "has-error" : ""}`}
          value={values.paidOn}
          max={todayKey()}
          onChange={(e) => set("paidOn", e.target.value)}
        />
      </div>
      <div className="form-field">
        <label htmlFor="sal-mode">Payment mode</label>
        <select
          id="sal-mode"
          className={`input ${errors.paymentMode ? "has-error" : ""}`}
          value={values.paymentMode}
          onChange={(e) => set("paymentMode", e.target.value)}
        >
          {PAYMENT_MODES.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </div>
      <div className="form-field is-wide">
        <label htmlFor="sal-ref">Reference (optional)</label>
        <input
          id="sal-ref"
          className="input"
          value={values.reference}
          maxLength={80}
          onChange={(e) => set("reference", e.target.value)}
          placeholder="UTR / UPI transaction ID / cheque number"
        />
      </div>
    </div>
  );
}

// Quick "mark as paid" from the list
export function PayForm({ record, onSaved, onCancel }) {
  const [values, setValues] = useState({ paidOn: todayKey(), paymentMode: "bank_transfer", reference: record.reference || "" });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (field, value) => {
    setValues((v) => ({ ...v, [field]: value }));
    setErrors({});
    setError("");
  };

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { data } = await api.patch(`/salaries/${record._id}/pay`, values);
      onSaved(data.message);
    } catch (err) {
      const fieldErrors = err.response?.data?.errors;
      if (fieldErrors) setErrors(fieldErrors);
      setError(fieldErrors ? Object.values(fieldErrors)[0] : getErrorMessage(err));
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
      <div className="sal-net sal-net-pay">
        <span>Amount</span>
        <strong>{formatMoney(record.netPay)}</strong>
      </div>
      <PaymentFields values={values} set={set} errors={errors} />
      <div className="form-actions">
        <button type="button" className="button button-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="button button-primary" disabled={saving}>
          {saving ? "Saving…" : "Mark as Paid"}
        </button>
      </div>
    </form>
  );
}

// Every month's salary for one employee
export function SalaryHistory({ userId }) {
  const [result, setResult] = useState({ data: null, error: "" });

  useEffect(() => {
    let cancelled = false;
    api
      .get(`/salaries/user/${userId}`)
      .then(({ data }) => !cancelled && setResult({ data, error: "" }))
      .catch((err) => !cancelled && setResult({ data: null, error: getErrorMessage(err) }));
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const { data, error } = result;
  if (error) return <p className="form-error">{error}</p>;
  if (!data) return <p className="panel-empty">Loading…</p>;
  if (!data.records.length) return <p className="panel-empty">No salary records yet.</p>;

  return (
    <>
      <div className="att-chips">
        <span>
          <strong>{data.totals.months}</strong> month{data.totals.months === 1 ? "" : "s"}
        </span>
        <span>
          <strong>{formatMoney(data.totals.paid)}</strong> paid in total
        </span>
        <span>
          <strong>{formatMoney(data.totals.incentives)}</strong> incentives earned
        </span>
      </div>
      <div className="att-table-wrap">
        <table className="att-table sal-history-table">
          <thead>
            <tr>
              <th>Month</th>
              <th>Base</th>
              <th>Incentives</th>
              <th>Deductions</th>
              <th>Net pay</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {data.records.map((r) => (
              <tr key={r._id}>
                <td className="att-date">{formatMonth(r.month)}</td>
                <td>{formatMoney(r.baseSalary)}</td>
                <td className="sal-plus" title={r.incentives.map((l) => `${l.title}: ${formatMoney(l.amount)}`).join("\n")}>
                  {r.incentiveTotal ? `+${formatMoney(r.incentiveTotal)}` : "—"}
                </td>
                <td className="sal-minus" title={r.deductions.map((l) => `${l.title}: ${formatMoney(l.amount)}`).join("\n")}>
                  {r.deductionTotal ? `−${formatMoney(r.deductionTotal)}` : "—"}
                </td>
                <td>
                  <strong>{formatMoney(r.netPay)}</strong>
                </td>
                <td>
                  <span className={`sal-pill sal-${r.status}`}>{r.status === "paid" ? "Paid" : "Pending"}</span>
                  {r.status === "paid" && (
                    <span className="att-muted sal-paid-meta">
                      {formatDate(r.paidOn)} · {PAYMENT_MODE_LABELS[r.paymentMode]}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
