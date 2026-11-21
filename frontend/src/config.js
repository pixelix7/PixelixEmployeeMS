export const APP_NAME = "Pixelix EMS";

// In development Vite proxies /api to the backend (see vite.config.js).
// In production set VITE_API_URL, e.g. https://api.example.com/api
export const API_URL = import.meta.env.VITE_API_URL || "/api";

// Must match TIMEZONE in the backend .env so dates line up
export const OFFICE_TIMEZONE = "Asia/Kolkata";

export const ROLES = {
  ADMIN: "admin",
  TELECALLER: "telecaller",
  DIGITAL_MARKETING: "digital_marketing",
};

export const ROLE_LABELS = {
  admin: "Admin",
  telecaller: "Telecaller",
  digital_marketing: "Digital Marketing",
};

// ---------- Telecaller CRM ----------
export const LEAD_SOURCES = [
  { value: "instagram", label: "Instagram" },
  { value: "facebook", label: "Facebook" },
  { value: "amazon", label: "Amazon" },
  { value: "flipkart", label: "Flipkart" },
  { value: "other", label: "Other" },
];

export const SOURCE_LABELS = Object.fromEntries(LEAD_SOURCES.map((s) => [s.value, s.label]));

// Order here is the order shown in the form
export const CALL_STATUSES = [
  { value: "new", label: "New (not called)" },
  { value: "no_answer", label: "No answer" },
  { value: "busy", label: "Busy" },
  { value: "call_back", label: "Call back" },
  { value: "interested", label: "Interested" },
  { value: "not_interested", label: "Not interested" },
  { value: "converted", label: "Converted" },
  { value: "invalid", label: "Wrong number" },
];

export const CALL_STATUS_LABELS = Object.fromEntries(CALL_STATUSES.map((s) => [s.value, s.label]));

// Leads in these statuses don't need follow-ups (matches the backend)
export const CLOSED_STATUSES = ["not_interested", "converted", "invalid"];

// ---------- Digital marketing work log ----------
export const WORK_CATEGORIES = [
  { value: "seo_optimization", label: "SEO Optimization" },
  { value: "website_audit", label: "Website Audit" },
  { value: "social_media", label: "Social Media Management" },
  { value: "graphic_design", label: "Graphic Designing" },
  { value: "content_creation", label: "Content Creation" },
  { value: "campaign_management", label: "Campaign Management" },
  { value: "client_reporting", label: "Client Reporting" },
  { value: "ecommerce_listing", label: "E-commerce Listing" },
  { value: "other_tasks", label: "Other Tasks" },
];
export const WORK_CATEGORY_LABELS = Object.fromEntries(WORK_CATEGORIES.map((c) => [c.value, c.label]));

export const WORK_STATUS_LABELS = {
  pending: "To do",
  in_progress: "In progress",
  completed: "Completed",
  closed_won: "Closed – Won",
  closed_lost: "Closed – Lost",
  cancelled: "Cancelled",
};

export const CLOSED_WORK_STATUSES = ["completed", "closed_won", "closed_lost", "cancelled"];

// Same rule as the backend: website audits close as won/lost, everything else as completed
const OUTCOME_CATEGORIES = ["website_audit"];
export const workStatusesFor = (category) => [
  "pending",
  "in_progress",
  ...(OUTCOME_CATEGORIES.includes(category) ? ["closed_won", "closed_lost"] : ["completed"]),
  "cancelled",
];

// Attendance day statuses (match the backend)
export const DAY_STATUS_LABELS = {
  present: "On time",
  late: "Late",
  half_day: "Half day",
  absent: "Absent",
  not_in: "Not in yet",
  holiday: "Holiday",
  off: "Off day",
  leave: "On leave",
};

// ---------- Leave (match the backend) ----------
export const LEAVE_TYPES = [
  { value: "casual", label: "Casual" },
  { value: "sick", label: "Sick" },
  { value: "earned", label: "Earned" },
  { value: "unpaid", label: "Unpaid" },
  { value: "other", label: "Other" },
];
export const LEAVE_TYPE_LABELS = Object.fromEntries(LEAVE_TYPES.map((t) => [t.value, t.label]));

export const LEAVE_STATUS_LABELS = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

// ---------- Announcements ----------
export const ANNOUNCEMENT_AUDIENCES = [
  { value: "all", label: "Everyone" },
  { value: "telecaller", label: "Telecallers" },
  { value: "digital_marketing", label: "Digital Marketing" },
];
export const AUDIENCE_LABELS = Object.fromEntries(ANNOUNCEMENT_AUDIENCES.map((a) => [a.value, a.label]));

// ---------- Tasks (admin assigns to employees) ----------
export const TASK_STATUS_LABELS = {
  todo: "To do",
  in_progress: "In progress",
  done: "Done",
  cancelled: "Cancelled",
};
export const TASK_PRIORITIES = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];
export const TASK_PRIORITY_LABELS = Object.fromEntries(TASK_PRIORITIES.map((p) => [p.value, p.label]));

// ---------- Clients ----------
export const CLIENT_STATUSES = [
  { value: "active", label: "Active" },
  { value: "on_hold", label: "On hold" },
  { value: "inactive", label: "Inactive" },
];
export const CLIENT_STATUS_LABELS = Object.fromEntries(CLIENT_STATUSES.map((s) => [s.value, s.label]));

// ---------- Salary ----------
export const PAYMENT_MODES = [
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "upi", label: "UPI" },
  { value: "cash", label: "Cash" },
  { value: "cheque", label: "Cheque" },
];
export const PAYMENT_MODE_LABELS = Object.fromEntries(PAYMENT_MODES.map((m) => [m.value, m.label]));

// ---------- Work reports (employee end-of-day reports) ----------
export const REPORT_STATUS_LABELS = {
  pending: "Pending review",
  approved: "Approved",
  rejected: "Needs changes",
};

// ---------- Projects (client work) ----------
export const PROJECT_STATUSES = [
  { value: "planning", label: "Planning" },
  { value: "in_progress", label: "In progress" },
  { value: "on_hold", label: "On hold" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];
export const PROJECT_STATUS_LABELS = Object.fromEntries(PROJECT_STATUSES.map((s) => [s.value, s.label]));
