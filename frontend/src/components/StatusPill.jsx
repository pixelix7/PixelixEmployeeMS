import { DAY_STATUS_LABELS } from "../config";

export default function StatusPill({ status }) {
  return <span className={`att-status att-${status}`}>{DAY_STATUS_LABELS[status] || status}</span>;
}
