import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/client";
import { NotepadIcon } from "./Icons";
import "./WorkReportBits.css";

const TEXT = {
  none: ["Today's work report isn't submitted yet", "Write a few lines about what you worked on before you log off.", "Write Report"],
  pending: ["Today's work report is waiting for review", "You can still edit it until the admin reviews it.", "View Report"],
  approved: ["Today's work report is approved", "Nice work — see you tomorrow.", "View Reports"],
  rejected: ["The admin sent a report back", "Read their note, fix it and resubmit.", "Fix & Resubmit"],
};

// Employee dashboard reminder for the end-of-day work report
export default function TodayReportCard() {
  const [state, setState] = useState(null);

  useEffect(() => {
    api
      .get("/work-reports/summary")
      .then(({ data }) => setState(data.rejected ? "rejected" : data.today || "none"))
      .catch(() => setState(null));
  }, []);

  if (!state) return null;
  const [title, detail, action] = TEXT[state];

  return (
    <Link to="/work-reports" className={`wr-reminder is-${state}`}>
      <span className="wr-reminder-icon">
        <NotepadIcon width={20} height={20} />
      </span>
      <span className="wr-reminder-text">
        <strong>{title}</strong>
        <small>{detail}</small>
      </span>
      <span className="wr-reminder-action">{action} →</span>
    </Link>
  );
}
