// Returns a new object with only the allowed keys that are present in source.
// Used to stop clients from setting fields they shouldn't (mass assignment).
export default function pick(source = {}, allowedKeys) {
  const result = {};
  for (const key of allowedKeys) {
    if (source[key] !== undefined) result[key] = source[key];
  }
  return result;
}
