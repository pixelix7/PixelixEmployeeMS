import { AUDIENCE_LABELS } from "../config";
import { formatDay, formatWhen } from "../utils/format";
import { PinIcon } from "./Icons";
import "./AnnouncementBits.css";

// One announcement. `isNew` shows the unread dot; `footer` holds admin stats/actions.
export function AnnouncementCard({ announcement: a, isNew = false, showAudience = false, clamp = false, footer }) {
  const important = a.priority === "important";
  return (
    <article className={`ann-card ${important ? "is-important" : ""} ${a.expired ? "is-expired" : ""}`}>
      <header className="ann-head">
        <div className="ann-tags">
          {a.pinned && (
            <span className="ann-tag ann-tag-pin">
              <PinIcon width={12} height={12} /> Pinned
            </span>
          )}
          {important && <span className="ann-tag ann-tag-important">Important</span>}
          {showAudience && <span className="ann-tag">{AUDIENCE_LABELS[a.audience]}</span>}
          {a.expired && <span className="ann-tag">Expired</span>}
          {isNew && <span className="ann-tag ann-tag-new">New</span>}
        </div>
        <span className="ann-when">{formatWhen(a.createdAt)}</span>
      </header>
      <h3 className="ann-title">{a.title}</h3>
      <p className={`ann-message ${clamp ? "is-clamped" : ""}`}>{a.message}</p>
      <p className="ann-meta">
        Posted by {a.createdBy ? `${a.createdBy.firstName} ${a.createdBy.lastName}` : "Admin"}
        {a.expiresOn && !a.expired && ` · Shown until ${formatDay(a.expiresOn)}`}
        {a.expired && ` · Ended ${formatDay(a.expiresOn)}`}
      </p>
      {footer}
    </article>
  );
}
