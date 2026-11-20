const LABELS = {
  present: "On time",
  late: "Late",
  absent: "Absent",
  not_in: "Not in yet",
  off: "Off day",
};

export default function StatusPill({ status }) {
  return <span className={`att-status att-${status}`}>{LABELS[status] || status}</span>;
}
