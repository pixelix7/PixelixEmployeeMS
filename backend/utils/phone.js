// Turns "+91 98765-43210", "098765 43210" or "9876543210" into "9876543210",
// so the same number is always stored (and duplicate-checked) the same way.
export const normalizePhone = (value) => {
  if (value == null) return value;
  let digits = String(value).replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  return digits;
};

export const isValidPhone = (digits) => /^[6-9]\d{9}$/.test(digits);
