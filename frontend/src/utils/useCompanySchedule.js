import { useEffect, useState } from "react";
import api from "../api/client";

// Company schedule defaults from the backend (.env), fetched once and shared
let cache = null;
let pending = null;

export default function useCompanySchedule() {
  const [schedule, setSchedule] = useState(cache);
  useEffect(() => {
    if (cache) return;
    pending ??= api.get("/attendance/settings").then(({ data }) => (cache = data.company));
    pending.then(setSchedule).catch(() => {
      pending = null;
    });
  }, []);
  return schedule;
}
