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
  { value: "audit_demo", label: "Audit / Demo" },
  { value: "creative_design", label: "Creative / Design" },
  { value: "campaign_post", label: "Campaign / Post" },
  { value: "client_followup", label: "Client / Lead Follow-up" },
  { value: "assigned_task", label: "Assigned Task" },
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

// Same rule as the backend: audits/demos and follow-ups close as won/lost
const OUTCOME_CATEGORIES = ["audit_demo", "client_followup"];
export const workStatusesFor = (category) => [
  "pending",
  "in_progress",
  ...(OUTCOME_CATEGORIES.includes(category) ? ["closed_won", "closed_lost"] : ["completed"]),
  "cancelled",
];
