import { CALL_STATUS_LABELS } from "../config";
import { formatPhone } from "../utils/format";
import { PhoneIcon, WhatsAppIcon } from "./Icons";
import "./LeadBits.css";

export function CallStatusPill({ status }) {
  return <span className={`call-pill call-${status}`}>{CALL_STATUS_LABELS[status] || status}</span>;
}

// Phone number with one-tap call and WhatsApp buttons
export function ContactLinks({ phone, compact = false }) {
  return (
    <span className="contact">
      {!compact && <span className="contact-number">{formatPhone(phone)}</span>}
      <a
        className="contact-btn"
        href={`tel:+91${phone}`}
        title={`Call ${formatPhone(phone)}`}
        aria-label={`Call ${formatPhone(phone)}`}
        onClick={(e) => e.stopPropagation()}
      >
        <PhoneIcon width={14} height={14} />
      </a>
      <a
        className="contact-btn is-wa"
        href={`https://wa.me/91${phone}`}
        target="_blank"
        rel="noreferrer"
        title="Open WhatsApp chat"
        aria-label={`WhatsApp ${formatPhone(phone)}`}
        onClick={(e) => e.stopPropagation()}
      >
        <WhatsAppIcon width={14} height={14} />
      </a>
    </span>
  );
}
