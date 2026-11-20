import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api, { getErrorMessage } from "../api/client";
import { SOURCE_LABELS } from "../config";
import { formatWhen } from "../utils/format";
import { ArrowRightIcon } from "./Icons";
import { CallStatusPill, ContactLinks } from "./LeadBits";
import LeadForm from "./LeadForm";
import Modal from "./Modal";
import "./TodayFollowUps.css";

// "Today's Follow-ups": calls due today plus anything overdue, earliest first
export default function TodayFollowUps() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(null);

  const load = useCallback(
    () =>
      api
        .get("/leads/follow-ups/today")
        .then(({ data }) => {
          // Remember when we loaded, to mark overdue items without reading the clock during render
          setData({ ...data, loadedAt: Date.now() });
          setError("");
        })
        .catch((err) => setError(getErrorMessage(err))),
    []
  );

  useEffect(() => {
    load();
  }, [load]);

  return (
    <section className="panel fu-panel">
      <div className="panel-head">
        <h2>
          Today's Follow-ups
          {data && <span className="fu-count">{data.total}</span>}
          {data?.overdue > 0 && <span className="fu-overdue-count">{data.overdue} overdue</span>}
        </h2>
        <Link to="/leads" className="panel-link">
          All leads <ArrowRightIcon width={16} height={16} />
        </Link>
      </div>

      {error ? (
        <p className="panel-empty">{error}</p>
      ) : !data ? (
        <p className="panel-empty">Loading…</p>
      ) : data.leads.length === 0 ? (
        <p className="panel-empty">No follow-ups due today. Set a follow-up time when you update a lead.</p>
      ) : (
        <ul className="fu-list">
          {data.leads.map((lead) => {
            const overdue = new Date(lead.followUpAt).getTime() < data.loadedAt;
            return (
              <li key={lead._id} className={`fu-item ${overdue ? "is-overdue" : ""}`}>
                <div className="fu-time">
                  <span>{formatWhen(lead.followUpAt)}</span>
                  {overdue && <small>Overdue</small>}
                </div>
                <div className="fu-main">
                  <p className="fu-name">{lead.businessName}</p>
                  <p className="fu-meta">
                    {SOURCE_LABELS[lead.source]}
                    {lead.notes && <> · {lead.notes}</>}
                  </p>
                </div>
                <CallStatusPill status={lead.callStatus} />
                <ContactLinks phone={lead.phone} />
                <button
                  type="button"
                  className="button button-secondary fu-update"
                  onClick={() => setEditing(lead)}
                >
                  Update
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {editing && (
        <Modal
          title={editing.businessName}
          subtitle="Log the call and set the next follow-up"
          onClose={() => setEditing(null)}
        >
          <LeadForm
            lead={editing}
            onSaved={() => {
              setEditing(null);
              load();
            }}
            onCancel={() => setEditing(null)}
          />
        </Modal>
      )}
    </section>
  );
}
