import { WORK_CATEGORY_LABELS, WORK_STATUS_LABELS } from "../config";
import "./WorkBits.css";

export function CategoryBadge({ category }) {
  return <span className={`cat-badge cat-${category}`}>{WORK_CATEGORY_LABELS[category] || category}</span>;
}

export function WorkStatusPill({ status }) {
  return <span className={`work-pill work-${status}`}>{WORK_STATUS_LABELS[status] || status}</span>;
}
