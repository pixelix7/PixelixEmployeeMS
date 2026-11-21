import mongoose from "mongoose";

// Named sequences, e.g. { _id: "employee-26", seq: 7 } for employee IDs in 2026
const counterSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    seq: { type: Number, default: 0 },
  },
  { versionKey: false }
);

const Counter = mongoose.model("Counter", counterSchema);

// Atomically take the next number in a sequence (1, 2, 3, ...)
export const nextSequence = async (name) => {
  const counter = await Counter.findOneAndUpdate({ _id: name }, { $inc: { seq: 1 } }, { upsert: true, new: true });
  return counter.seq;
};

export default Counter;
