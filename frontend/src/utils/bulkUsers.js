import { ROLES } from "../config";

export const BULK_LIMIT = 100; // matches the backend

export const TEMPLATE_HEADERS = ["firstName", "lastName", "phone", "email", "role", "pan", "aadhar", "password"];

export const TEMPLATE_ROWS = [
  TEMPLATE_HEADERS,
  ["Ravi", "Kumar", "9876543210", "ravi.kumar@example.com", "telecaller", "ABCDE1234F", "", ""],
  ["Sara", "Khan", "9876501234", "sara.khan@example.com", "digital_marketing", "", "", ""],
];

// Header spellings people actually type ("First Name", "Mobile", "Aadhaar No" ...)
const HEADER_ALIASES = {
  firstName: ["firstname", "first", "fname"],
  lastName: ["lastname", "last", "lname", "surname"],
  phone: ["phone", "phonenumber", "mobile", "mobilenumber", "contact", "whatsapp"],
  email: ["email", "emailaddress", "mail", "workemail"],
  role: ["role", "systemrole", "designation"],
  pan: ["pan", "pannumber", "panno"],
  aadhar: ["aadhar", "aadhaar", "aadharnumber", "aadhaarnumber", "aadharno", "aadhaarno"],
  password: ["password", "temporarypassword", "pass"],
};

const squash = (s) => s.toLowerCase().replace(/[^a-z]/g, "");

const fieldForHeader = (header) => {
  const h = squash(header);
  return Object.keys(HEADER_ALIASES).find((f) => HEADER_ALIASES[f].includes(h)) || null;
};

const ROLE_ALIASES = {
  admin: ROLES.ADMIN,
  administrator: ROLES.ADMIN,
  telecaller: ROLES.TELECALLER,
  telecalling: ROLES.TELECALLER,
  digitalmarketing: ROLES.DIGITAL_MARKETING,
  digital: ROLES.DIGITAL_MARKETING,
  marketing: ROLES.DIGITAL_MARKETING,
};

const normalizePhone = (v) => {
  let d = v.replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  return d;
};

// Excel turns long numbers into "1.23457E+11" if the column isn't formatted as Text
const looksScientific = (v) => /^\d(\.\d+)?e\+\d+$/i.test(v.trim());

// Same rules as the backend, so problems show up before uploading
function validate(u) {
  const errors = {};
  if (!u.firstName) errors.firstName = "First name is required";
  if (!u.lastName) errors.lastName = "Last name is required";

  if (looksScientific(u.rawPhone)) errors.phone = "Excel changed this number — format the column as Text";
  else if (!/^[6-9]\d{9}$/.test(u.phone)) errors.phone = "Enter a valid 10-digit phone number";

  if (!u.email) errors.email = "Email is required";
  else if (!/^\S+@\S+\.\S+$/.test(u.email)) errors.email = "Enter a valid email address";

  if (!u.role) errors.role = "Role must be admin, telecaller or digital_marketing";
  if (u.pan && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(u.pan)) errors.pan = "Enter a valid PAN (e.g. ABCDE1234F)";

  if (u.rawAadhar && looksScientific(u.rawAadhar)) {
    errors.aadhar = "Excel changed this number — format the column as Text";
  } else if (u.aadhar && !/^\d{12}$/.test(u.aadhar)) {
    errors.aadhar = "Aadhar must be 12 digits";
  }

  if (u.password && u.password.length < 8) errors.password = "Password must be at least 8 characters";
  return errors;
}

// CSV rows (first row = headers) -> { rows: [{ row, data, errors }], missing, unknown }
export function readUserRows(table) {
  const [headerRow = [], ...body] = table;
  const fields = headerRow.map(fieldForHeader);
  const missing = ["firstName", "lastName", "phone", "email"].filter((f) => !fields.includes(f));
  const unknown = headerRow.filter((h, i) => h.trim() && !fields[i]);

  const rows = [];
  body.forEach((cells, i) => {
    if (cells.every((c) => !c.trim())) return; // skip blank lines
    const get = (field) => {
      const idx = fields.indexOf(field);
      return idx === -1 ? "" : (cells[idx] || "").trim();
    };
    const roleText = get("role");
    const user = {
      firstName: get("firstName"),
      lastName: get("lastName"),
      rawPhone: get("phone"),
      phone: normalizePhone(get("phone")),
      email: get("email").toLowerCase(),
      // Blank role = telecaller (the most common hire)
      role: roleText ? ROLE_ALIASES[squash(roleText)] || null : ROLES.TELECALLER,
      pan: get("pan").toUpperCase(),
      rawAadhar: get("aadhar"),
      aadhar: get("aadhar").replace(/\s/g, ""),
      password: get("password"),
    };
    const errors = validate(user);

    // Same email twice in the file
    const earlier = rows.find((r) => user.email && r.data.email === user.email);
    if (earlier && !errors.email) errors.email = `Same email as row ${earlier.row}`;

    // What gets sent (the raw cells were only needed for validation)
    const data = {
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      email: user.email,
      role: user.role,
      pan: user.pan,
      aadhar: user.aadhar,
      password: user.password,
    };
    rows.push({ row: i + 2, data, errors }); // +2: header is row 1, rows start at 1
  });

  return { rows, missing, unknown };
}
