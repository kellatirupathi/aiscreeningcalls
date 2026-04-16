import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Download, RefreshCw, Search, Star, X, Play, FileText, AlertCircle, History } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { PageHeader } from "@/components/ui/PageHeader";
import { Select } from "@/components/ui/Select";
import { useAgents } from "@/hooks/useAgents";
import { useRatingDetail, useRatings, useRatingsByPhone, useRegenerateRating, useReloadRatings } from "@/hooks/useRatings";
import type { RatingRow } from "@/types";

const AUTO_REFRESH_MS = 5 * 60 * 1000;

function formatCountdown(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function StarRating({ value }: { value: number | null }) {
  if (value == null) return <span style={{ color: "#9ca3af", fontSize: 13 }}>—</span>;
  const rounded = Math.max(0, Math.min(5, Math.round(value)));
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 2 }} title={`${value.toFixed(1)}/5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          size={13}
          fill={i <= rounded ? "#f59e0b" : "none"}
          color={i <= rounded ? "#f59e0b" : "#d1d5db"}
          strokeWidth={1.5}
        />
      ))}
      <span style={{ fontSize: 11, color: "#6b7280", marginLeft: 4 }}>{value.toFixed(1)}/5</span>
    </span>
  );
}

function RatingCell({ value, reason }: { value: number | null; reason?: string }) {
  if (value == null) {
    return <span style={{ color: "#9ca3af", fontSize: 12 }}>—</span>;
  }
  return (
    <span title={reason || ""} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      <Star size={12} fill="#f59e0b" color="#f59e0b" />
      <strong style={{ fontSize: 13 }}>{value}/5</strong>
    </span>
  );
}

function maskPhone(phone: string) {
  if (!phone || phone === "--") return "—";
  if (phone.length <= 6) return phone;
  return `${phone.slice(0, 3)}••••${phone.slice(-3)}`;
}

export default function RatingsPage() {
  const { callId } = useParams();
  const navigate = useNavigate();
  const [source, setSource] = useState<"all" | "test" | "campaign">("all");
  const [agentId, setAgentId] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [countdown, setCountdown] = useState(AUTO_REFRESH_MS);
  const [historyPhone, setHistoryPhone] = useState<string | null>(null);

  const { data: agents = [] } = useAgents();
  const { data, isLoading, dataUpdatedAt } = useRatings({
    source,
    agentId: agentId || undefined,
    search: searchQuery || undefined
  });
  const { data: detail } = useRatingDetail(callId);
  const { data: historyData } = useRatingsByPhone(historyPhone ?? undefined);
  const reload = useReloadRatings();
  const regenerate = useRegenerateRating();

  // Countdown ticker — resets whenever React Query refetches
  useEffect(() => {
    const interval = setInterval(() => {
      const elapsed = Date.now() - dataUpdatedAt;
      setCountdown(Math.max(0, AUTO_REFRESH_MS - elapsed));
    }, 1000);
    return () => clearInterval(interval);
  }, [dataUpdatedAt]);

  const rows = data?.rows ?? [];
  const skillColumns = data?.skillColumns ?? [];
  const pendingCount = data?.pendingCount ?? 0;

  const stats = useMemo(() => {
    const rated = rows.filter((r) => r.ratingStatus === "rated").length;
    const numericOverall = rows.filter((r) => typeof r.overallRating === "number");
    const avg =
      numericOverall.length > 0
        ? numericOverall.reduce((sum, r) => sum + (r.overallRating ?? 0), 0) / numericOverall.length
        : 0;
    return { rated, avg };
  }, [rows]);

  async function handleReload() {
    try {
      const res = await reload.mutateAsync();
      if (res.enqueued === 0) {
        // No-op visually — React Query will refetch.
      }
    } catch {
      // ignore — toast system can be added later
    }
  }

  function handleExport() {
    if (rows.length === 0) return;
    const headers = [
      "date",
      "candidate",
      "phone",
      "source",
      "agent",
      "duration",
      "selfIntro",
      "communication",
      ...skillColumns,
      "overall"
    ];
    const csv = [headers.join(",")];
    for (const r of rows) {
      const cells = [
        r.startedAtIso,
        r.candidateName,
        r.phone,
        r.source,
        r.agentName,
        r.duration,
        r.selfIntroRating ?? "",
        r.communicationRating ?? "",
        ...skillColumns.map((s) => r.skillRatings[s]?.rating ?? ""),
        r.overallRating?.toFixed(2) ?? ""
      ];
      csv.push(cells.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","));
    }
    const blob = new Blob([csv.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ratings-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleRowClick(row: RatingRow) {
    navigate(`/ratings/${row.id}`);
  }

  function handleCloseDrawer() {
    navigate("/ratings");
  }

  return (
    <div className="ch-page">
      <div className="ch-header">
        <PageHeader
          title="Ratings"
          subtitle={`Auto-refresh in ${formatCountdown(countdown)} · ${pendingCount} pending`}
        />
        <div className="ch-header__actions">
          <Button onClick={handleReload} disabled={reload.isPending}>
            <RefreshCw size={14} className={reload.isPending ? "spin" : ""} />
            <span>{reload.isPending ? "Reloading…" : "Reload"}</span>
          </Button>
          <Button onClick={handleExport}>
            <Download size={14} />
            <span>Export CSV</span>
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="ch-stats">
        <div className="ch-stat">
          <div className="ch-stat__icon ch-stat__icon--blue"><FileText size={16} /></div>
          <div>
            <div className="ch-stat__value">{rows.length}</div>
            <div className="ch-stat__label">Total Calls</div>
          </div>
        </div>
        <div className="ch-stat">
          <div className="ch-stat__icon ch-stat__icon--green"><Star size={16} /></div>
          <div>
            <div className="ch-stat__value">{stats.rated}</div>
            <div className="ch-stat__label">Rated</div>
          </div>
        </div>
        <div className="ch-stat">
          <div className="ch-stat__icon ch-stat__icon--amber"><AlertCircle size={16} /></div>
          <div>
            <div className="ch-stat__value">{pendingCount}</div>
            <div className="ch-stat__label">Pending</div>
          </div>
        </div>
        <div className="ch-stat">
          <div className="ch-stat__icon ch-stat__icon--blue"><Star size={16} /></div>
          <div>
            <div className="ch-stat__value">{stats.avg > 0 ? `${stats.avg.toFixed(2)}/5` : "—"}</div>
            <div className="ch-stat__label">Avg Score</div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="ch-filters">
        <div className="ch-search">
          <Search size={15} className="ch-search__icon" />
          <Input
            placeholder="Search by candidate name or phone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Select value={source} onChange={(e) => setSource(e.target.value as "all" | "test" | "campaign")}>
          <option value="all">All Sources</option>
          <option value="test">Test Calls</option>
          <option value="campaign">Campaigns</option>
        </Select>
        <Select value={agentId} onChange={(e) => setAgentId(e.target.value)}>
          <option value="">All Agents</option>
          {agents.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </Select>
      </div>

      {/* Table */}
      <Card style={{ overflow: "auto", padding: 0 }}>
        {isLoading ? (
          <div style={{ padding: 24, color: "#6b7280" }}>Loading ratings…</div>
        ) : rows.length === 0 ? (
          <EmptyState
            compact
            title="No rated calls yet"
            description="Ratings are generated automatically every 5 minutes after a call ends. Click Reload to trigger it now."
          />
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#f9fafb", textAlign: "left" }}>
                <th style={thStyle}>Date</th>
                <th style={thStyle}>Candidate</th>
                <th style={thStyle}>Phone</th>
                <th style={thStyle}>Source</th>
                <th style={thStyle}>Agent</th>
                <th style={thStyle}>Duration</th>
                <th style={thStyle}>End Reason</th>
                <th style={thStyle}>Self Intro</th>
                <th style={thStyle}>Comm.</th>
                {skillColumns.map((s) => (
                  <th key={s} style={thStyle}>{s}</th>
                ))}
                <th style={thStyle}>Overall</th>
                <th style={thStyle}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  onClick={() => handleRowClick(row)}
                  style={{
                    borderTop: "1px solid #e5e7eb",
                    cursor: "pointer",
                    background: callId === row.id ? "#eff6ff" : "transparent"
                  }}
                >
                  <td style={tdStyle}>{row.startedAt}</td>
                  <td style={tdStyle}>
                    <strong>{row.candidateName}</strong>
                  </td>
                  <td style={tdStyle}>{row.phone}</td>
                  <td style={tdStyle}>
                    <span style={{ ...chipStyle, background: row.source === "campaign" ? "#dbeafe" : "#f3e8ff", color: row.source === "campaign" ? "#1e40af" : "#6b21a8" }}>
                      {row.source}
                    </span>
                  </td>
                  <td style={tdStyle}>{row.agentName}</td>
                  <td style={tdStyle}>{row.duration}</td>
                  <td style={tdStyle}>
                    <span
                      style={{
                        ...chipStyle,
                        background: row.subStatus === "callback-requested" ? "#fef3c7" : row.endReason?.includes("Completed") ? "#d1fae5" : "#f3f4f6",
                        color: row.subStatus === "callback-requested" ? "#92400e" : row.endReason?.includes("Completed") ? "#065f46" : "#374151"
                      }}
                      title={row.callbackNote ?? ""}
                    >
                      {row.endReason ?? row.callStatus}
                    </span>
                    {row.callbackNote ? (
                      <div style={{ fontSize: 10, color: "#92400e", marginTop: 2 }}>
                        {row.callbackNote.slice(0, 40)}
                      </div>
                    ) : null}
                  </td>
                  <td style={tdStyle}>
                    {row.ratingStatus === "pending" || row.ratingStatus === "skipped" ? (
                      <span style={mutedStyle}>{row.ratingStatus === "skipped" ? "skipped" : "pending"}</span>
                    ) : (
                      <RatingCell value={row.selfIntroRating} reason={row.selfIntroReason} />
                    )}
                  </td>
                  <td style={tdStyle}>
                    <RatingCell value={row.communicationRating} reason={row.communicationReason} />
                  </td>
                  {skillColumns.map((s) => (
                    <td key={s} style={tdStyle}>
                      <RatingCell value={row.skillRatings[s]?.rating ?? null} reason={row.skillRatings[s]?.reason} />
                    </td>
                  ))}
                  <td style={tdStyle}>
                    {row.overallRating != null ? <StarRating value={row.overallRating} /> : <span style={mutedStyle}>—</span>}
                  </td>
                  <td style={tdStyle} onClick={(e) => e.stopPropagation()}>
                    <div style={{ display: "flex", gap: 6 }}>
                      {row.recordingUrl ? (
                        <a href={row.recordingUrl} target="_blank" rel="noreferrer" title="Play recording" style={iconBtnStyle}>
                          <Play size={13} />
                        </a>
                      ) : null}
                      {row.candidatePhone ? (
                        <button
                          type="button"
                          title="View all attempts for this phone"
                          onClick={() => setHistoryPhone(row.candidatePhone ?? null)}
                          style={iconBtnStyle}
                        >
                          <History size={13} />
                        </button>
                      ) : null}
                      <button
                        type="button"
                        title="Regenerate rating"
                        onClick={() => regenerate.mutate(row.id)}
                        style={iconBtnStyle}
                      >
                        <RefreshCw size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {/* Phone history drawer */}
      {historyPhone && historyData ? (
        <div style={drawerOverlayStyle} onClick={() => setHistoryPhone(null)}>
          <div style={drawerStyle} onClick={(e) => e.stopPropagation()}>
            <div style={drawerHeaderStyle}>
              <div>
                <h3 style={{ margin: 0 }}>Candidate history</h3>
                <div style={{ color: "#6b7280", fontSize: 12 }}>
                  {historyPhone} · {historyData.total} attempt{historyData.total === 1 ? "" : "s"}
                </div>
              </div>
              <button type="button" onClick={() => setHistoryPhone(null)} style={iconBtnStyle}>
                <X size={16} />
              </button>
            </div>
            <div style={{ padding: 16 }}>
              {historyData.rows.length === 0 ? (
                <div style={{ color: "#6b7280", fontSize: 13 }}>No rated calls for this phone yet.</div>
              ) : (
                historyData.rows.map((r) => (
                  <div
                    key={r.id}
                    style={{
                      padding: 12,
                      marginBottom: 10,
                      border: "1px solid #e5e7eb",
                      borderRadius: 8,
                      cursor: "pointer"
                    }}
                    onClick={() => {
                      setHistoryPhone(null);
                      navigate(`/ratings/${r.id}`);
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                      <strong style={{ fontSize: 13 }}>{r.startedAt}</strong>
                      <StarRating value={r.overallRating} />
                    </div>
                    <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>
                      {r.agentName} · {r.duration} · {r.source}
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", fontSize: 11 }}>
                      {Object.entries(r.skillRatings).map(([skill, v]) => (
                        <span key={skill} style={{ ...chipStyle, background: "#f3f4f6", color: "#374151" }}>
                          {skill}: {v.rating != null ? `${v.rating}/5` : "—"}
                        </span>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}

      {/* Detail drawer */}
      {callId && detail ? (
        <div style={drawerOverlayStyle} onClick={handleCloseDrawer}>
          <div style={drawerStyle} onClick={(e) => e.stopPropagation()}>
            <div style={drawerHeaderStyle}>
              <div>
                <h3 style={{ margin: 0 }}>{detail.candidateName}</h3>
                <div style={{ color: "#6b7280", fontSize: 12 }}>
                  {detail.agentName} · {detail.duration} · {detail.startedAt}
                </div>
              </div>
              <button type="button" onClick={handleCloseDrawer} style={iconBtnStyle}>
                <X size={16} />
              </button>
            </div>

            <div style={{ padding: 16 }}>
              {detail.overallRating != null ? (
                <div style={{ marginBottom: 16 }}>
                  <div style={drawerLabelStyle}>Overall</div>
                  <StarRating value={detail.overallRating} />
                </div>
              ) : null}

              <div style={{ marginBottom: 16 }}>
                <div style={drawerLabelStyle}>Self Introduction</div>
                <RatingCell value={detail.selfIntroRating} />
                {detail.selfIntroReason ? (
                  <div style={drawerReasonStyle}>{detail.selfIntroReason}</div>
                ) : null}
              </div>

              <div style={{ marginBottom: 16 }}>
                <div style={drawerLabelStyle}>Communication</div>
                <RatingCell value={detail.communicationRating} />
                {detail.communicationReason ? (
                  <div style={drawerReasonStyle}>{detail.communicationReason}</div>
                ) : null}
              </div>

              {Object.keys(detail.skillRatings).length > 0 ? (
                <div style={{ marginBottom: 16 }}>
                  <div style={drawerLabelStyle}>Technical Skills</div>
                  {Object.entries(detail.skillRatings).map(([skill, v]) => (
                    <div key={skill} style={{ marginTop: 10, paddingBottom: 10, borderBottom: "1px solid #f3f4f6" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <strong style={{ fontSize: 13 }}>{skill}</strong>
                        <RatingCell value={v.rating} />
                      </div>
                      {v.reason ? <div style={drawerReasonStyle}>{v.reason}</div> : null}
                      {v.evidence ? (
                        <div style={{ ...drawerReasonStyle, fontStyle: "italic", marginTop: 4 }}>"{v.evidence}"</div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}

              {detail.summary ? (
                <div style={{ marginBottom: 16 }}>
                  <div style={drawerLabelStyle}>AI Summary</div>
                  <div style={{ fontSize: 13, color: "#374151" }}>{detail.summary}</div>
                </div>
              ) : null}

              {detail.transcript && detail.transcript.length > 0 ? (
                <div>
                  <div style={drawerLabelStyle}>Transcript ({detail.transcript.length} turns)</div>
                  <div style={{ maxHeight: 300, overflow: "auto", border: "1px solid #e5e7eb", borderRadius: 6, padding: 8 }}>
                    {detail.transcript.map((t, i) => (
                      <div key={i} style={{ marginBottom: 8, fontSize: 12 }}>
                        <strong style={{ color: t.speaker === "Agent" ? "#2563eb" : "#047857" }}>{t.speaker}:</strong>{" "}
                        <span>{t.text}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {detail.ratingError ? (
                <div style={{ marginTop: 16, padding: 8, background: "#fef2f2", color: "#991b1b", borderRadius: 6, fontSize: 12 }}>
                  Rating error: {detail.ratingError}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: "10px 12px",
  fontWeight: 600,
  fontSize: 12,
  color: "#374151",
  borderBottom: "1px solid #e5e7eb",
  whiteSpace: "nowrap"
};

const tdStyle: React.CSSProperties = {
  padding: "10px 12px",
  verticalAlign: "middle",
  whiteSpace: "nowrap"
};

const mutedStyle: React.CSSProperties = { color: "#9ca3af", fontSize: 12 };

const chipStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "2px 8px",
  borderRadius: 10,
  fontSize: 11,
  textTransform: "capitalize",
  fontWeight: 500
};

const iconBtnStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 26,
  height: 26,
  padding: 0,
  border: "1px solid #e5e7eb",
  borderRadius: 6,
  background: "#fff",
  cursor: "pointer",
  color: "#4b5563"
};

const drawerOverlayStyle: React.CSSProperties = {
  position: "fixed",
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  background: "rgba(15, 23, 42, 0.35)",
  display: "flex",
  justifyContent: "flex-end",
  zIndex: 50
};

const drawerStyle: React.CSSProperties = {
  width: 480,
  maxWidth: "100%",
  height: "100%",
  background: "#fff",
  overflow: "auto",
  boxShadow: "-4px 0 16px rgba(0,0,0,0.1)"
};

const drawerHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  padding: 16,
  borderBottom: "1px solid #e5e7eb"
};

const drawerLabelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  textTransform: "uppercase",
  color: "#6b7280",
  marginBottom: 6,
  letterSpacing: 0.3
};

const drawerReasonStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#6b7280",
  marginTop: 4
};
