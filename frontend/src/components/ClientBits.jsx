import { Link } from "react-router-dom";
import { CLIENT_STATUS_LABELS, ROLE_LABELS } from "../config";
import { formatDate, formatMoney, formatPhone, formatWhen } from "../utils/format";
import { GlobeIcon, MailIcon, PhoneIcon } from "./Icons";
import "./ClientBits.css";

export function ClientStatusPill({ status }) {
  return <span className={`client-pill client-${status}`}>{CLIENT_STATUS_LABELS[status] || status}</span>;
}

const shortUrl = (url) => url.replace(/^https?:\/\//i, "").replace(/\/$/, "");

// Days until the contract ends (negative = ended)
const daysLeft = (end) => {
  if (!end) return null;
  const today = new Date();
  const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const [y, m, d] = end.split("-").map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - todayUtc) / 86400e3);
};

export function ContractEnd({ end }) {
  const left = daysLeft(end);
  if (left == null) return null;
  if (left < 0) return <span className="client-end is-ended">Contract ended {formatDate(end)}</span>;
  if (left <= 30) return <span className="client-end is-soon">Renewal due in {left} day{left === 1 ? "" : "s"}</span>;
  return null;
}

const Item = ({ label, children, wide }) => (
  <div className={`client-item ${wide ? "is-wide" : ""}`}>
    <dt>{label}</dt>
    <dd>{children || "—"}</dd>
  </div>
);

// Everything about one client. Admins get links to employee profiles.
// extra: anything to show above the actions (e.g. the client's projects)
export function ClientDetail({ client: c, isAdmin, extra, actions }) {
  return (
    <div className="client-detail">
      <div className="client-detail-head">
        <ClientStatusPill status={c.status} />
        {c.contractNumber && <span className="client-contract">Contract {c.contractNumber}</span>}
        <ContractEnd end={c.contractEnd} />
      </div>

      <div className="client-quick">
        <a href={`tel:${c.phone}`} className="client-quick-link">
          <PhoneIcon width={16} height={16} /> {formatPhone(c.phone)}
        </a>
        {c.email && (
          <a href={`mailto:${c.email}`} className="client-quick-link">
            <MailIcon width={16} height={16} /> {c.email}
          </a>
        )}
        {c.website && (
          <a href={c.website} target="_blank" rel="noreferrer noopener" className="client-quick-link">
            <GlobeIcon width={16} height={16} /> {shortUrl(c.website)}
          </a>
        )}
      </div>

      <p className="client-detail-title">Contact</p>
      <dl className="client-grid">
        <Item label="Contact person">{c.contactPerson}</Item>
        <Item label="Alternate number">{c.altPhone && formatPhone(c.altPhone)}</Item>
        <Item label="Industry">{c.industry}</Item>
        <Item label="City">{c.city}</Item>
        <Item label="Address" wide>
          {c.address}
        </Item>
        <Item label="GSTIN">{c.gstNumber}</Item>
      </dl>

      <p className="client-detail-title">Contract</p>
      <dl className="client-grid">
        <Item label="Date of joining">{formatDate(c.joinedOn)}</Item>
        <Item label="Contract number">{c.contractNumber}</Item>
        <Item label="Contract period">
          {c.contractStart || c.contractEnd ? `${formatDate(c.contractStart)} – ${formatDate(c.contractEnd)}` : ""}
        </Item>
        <Item label="Contract value">{c.contractValue != null && formatMoney(c.contractValue)}</Item>
        <Item label="Services" wide>
          {c.services}
        </Item>
      </dl>

      <p className="client-detail-title">Handled by</p>
      {c.assignedTo.length === 0 ? (
        <p className="client-unassigned">Not assigned to anyone yet.</p>
      ) : (
        <ul className="client-people">
          {c.assignedTo.map((u) => (
            <li key={u._id}>
              <span className="person-avatar">{u.firstName[0]}</span>
              <span>
                {isAdmin ? <Link to={`/employees/${u._id}`}>{u.firstName} {u.lastName}</Link> : `${u.firstName} ${u.lastName}`}
                <small>
                  {ROLE_LABELS[u.role]}
                  {u.isActive === false ? " · deactivated" : ""}
                </small>
              </span>
            </li>
          ))}
        </ul>
      )}

      {c.notes && (
        <>
          <p className="client-detail-title">Notes</p>
          <p className="client-notes">{c.notes}</p>
        </>
      )}

      {isAdmin && c.history?.length > 0 && (
        <>
          <p className="client-detail-title">History</p>
          <ol className="client-history">
            {[...c.history].reverse().map((h, i) => (
              <li key={i}>
                <span>{h.note}</span>
                <small>
                  {h.by ? `${h.by.firstName} ${h.by.lastName}` : "Someone"} · {formatWhen(h.at)}
                </small>
              </li>
            ))}
          </ol>
        </>
      )}

      {extra}

      {actions && <div className="form-actions client-actions">{actions}</div>}
    </div>
  );
}
