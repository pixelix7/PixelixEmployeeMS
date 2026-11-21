import WorkItem, { LEGACY_WORK_CATEGORIES, OUTCOME_CATEGORIES, WORK_STATUS } from "../models/WorkItem.js";
import User, { EMPLOYEE_ID_RE, employeeIdFor } from "../models/User.js";
import Counter from "../models/Counter.js";
import { dateKey } from "./time.js";

// One-off data fixes that are safe to run on every start (they only touch old data).

// Work types were renamed (Nov 2026). Move old work items to the new types.
// Old types that ended in won/lost but whose new type doesn't
// (client follow-ups -> Other Tasks) become completed / cancelled.
async function migrateWorkCategories() {
  const col = WorkItem.collection;
  const moved = [];
  for (const [oldKey, newKey] of Object.entries(LEGACY_WORK_CATEGORIES)) {
    if (!OUTCOME_CATEGORIES.includes(newKey)) {
      await col.updateMany({ category: oldKey, status: WORK_STATUS.WON }, { $set: { status: WORK_STATUS.COMPLETED } });
      await col.updateMany({ category: oldKey, status: WORK_STATUS.LOST }, { $set: { status: WORK_STATUS.CANCELLED } });
    }
    const { modifiedCount } = await col.updateMany({ category: oldKey }, { $set: { category: newKey } });
    if (modifiedCount) moved.push(`${modifiedCount} ${oldKey} -> ${newKey}`);
  }
  if (moved.length) console.log(`Work types updated: ${moved.join(", ")}`);
}

// Employee IDs (Nov 2026). Make sure each year's counter is at least the highest
// ID already used, then give IDs to anyone without one, oldest first, by joining year.
async function backfillEmployeeIds() {
  const highest = new Map();
  for (const u of await User.find({ employeeId: { $type: "string" } }).select("employeeId").lean()) {
    const m = EMPLOYEE_ID_RE.exec(u.employeeId);
    if (m) highest.set(m[1], Math.max(highest.get(m[1]) || 0, Number(m[2])));
  }
  for (const [yy, n] of highest) {
    await Counter.updateOne({ _id: `employee-${yy}` }, { $max: { seq: n } }, { upsert: true });
  }

  const missing = await User.find({ employeeId: { $exists: false } }).sort({ createdAt: 1, _id: 1 }).select("createdAt").lean();
  for (const u of missing) {
    const yy = dateKey(u.createdAt || new Date()).slice(2, 4);
    const { seq } = await Counter.findOneAndUpdate(
      { _id: `employee-${yy}` },
      { $inc: { seq: 1 } },
      { upsert: true, new: true }
    );
    // Direct update: employeeId is immutable through the model
    await User.collection.updateOne({ _id: u._id, employeeId: { $exists: false } }, { $set: { employeeId: employeeIdFor(yy, seq) } });
  }
  if (missing.length) console.log(`Employee IDs assigned to ${missing.length} existing user${missing.length === 1 ? "" : "s"}`);
}

export default async function runMigrations() {
  try {
    await migrateWorkCategories();
    await backfillEmployeeIds();
  } catch (err) {
    // Never block the server from starting
    console.error("Migration failed:", err.message);
  }
}
