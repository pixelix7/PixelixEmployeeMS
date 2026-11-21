import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/client";
import { AnnouncementCard } from "./AnnouncementBits";
import { ArrowRightIcon, BellIcon } from "./Icons";

const SHOWN = 3;

// Latest announcements on the employee dashboard (hidden when there are none)
export default function AnnouncementsPanel() {
  const [data, setData] = useState(null);
  const [marking, setMarking] = useState(false);

  useEffect(() => {
    api
      .get("/announcements", { params: { limit: 20 } })
      .then(({ data }) => setData(data))
      .catch(() => setData(null));
  }, []);

  if (!data || data.announcements.length === 0) return null;

  // Unread first so nothing new is hidden, then pinned/newest (server order)
  const sorted = [...data.announcements].sort((a, b) => Number(a.isRead) - Number(b.isRead));
  const shown = sorted.slice(0, SHOWN);

  const markAllRead = async () => {
    setMarking(true);
    try {
      await api.post("/announcements/read");
      setData((d) => ({ ...d, unread: 0, announcements: d.announcements.map((a) => ({ ...a, isRead: true })) }));
    } finally {
      setMarking(false);
    }
  };

  return (
    <section className="panel ann-panel">
      <div className="panel-head">
        <h2 className="ann-panel-title">
          <BellIcon width={18} height={18} />
          Announcements
          {data.unread > 0 && <span className="ann-count">{data.unread} new</span>}
        </h2>
        <div className="ann-panel-actions">
          {data.unread > 0 && (
            <button type="button" className="ann-mark" onClick={markAllRead} disabled={marking}>
              Mark all as read
            </button>
          )}
          <Link to="/announcements" className="panel-link">
            View all <ArrowRightIcon width={16} height={16} />
          </Link>
        </div>
      </div>
      <div className="ann-stack">
        {shown.map((a) => (
          <AnnouncementCard key={a._id} announcement={a} isNew={!a.isRead} clamp />
        ))}
      </div>
    </section>
  );
}
