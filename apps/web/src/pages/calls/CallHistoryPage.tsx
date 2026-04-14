import { useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Phone, Clock, Download, RefreshCw, Search, ChevronRight, Bot, User, FileText } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { PageHeader } from "@/components/ui/PageHeader";
import { Select } from "@/components/ui/Select";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useCalls } from "@/hooks/useCalls";
import type { CallRecord } from "@/types";

function parseDurationToSeconds(value: string) {
  const minutesMatch = value.match(/(\d+)m/);
  const secondsMatch = value.match(/(\d+)s/);
  const minutes = minutesMatch ? Number(minutesMatch[1]) : 0;
  const seconds = secondsMatch ? Number(secondsMatch[1]) : 0;
  return minutes * 60 + seconds;
}

function statusTone(status: string): "success" | "danger" | "warning" | "info" | "neutral" {
  switch (status) {
    case "Completed": return "success";
    case "Failed": return "danger";
    case "Running": return "info";
    case "No Answer": return "warning";
    default: return "neutral";
  }
}

export default function CallHistoryPage() {
  const { callId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: calls = [], isLoading } = useCalls();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [providerFilter, setProviderFilter] = useState("all");

  const filteredCalls = useMemo(() => {
    return calls.filter((call) => {
      if (searchQuery && !call.id.toLowerCase().includes(searchQuery.toLowerCase()) && !call.phone?.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      if (statusFilter !== "all" && call.status !== statusFilter) return false;
      if (providerFilter !== "all" && call.provider !== providerFilter) return false;
      return true;
    });
  }, [calls, searchQuery, statusFilter, providerFilter]);

  const selectedCall = useMemo(() => {
    if (callId) return calls.find((c) => c.id === callId) ?? null;
    return filteredCalls[0] ?? null;
  }, [callId, calls, filteredCalls]);

  const completedCount = calls.filter((c) => c.status === "Completed").length;
  const failedCount = calls.filter((c) => c.status === "Failed").length;
  const runningCount = calls.filter((c) => c.status === "Running").length;
  const avgDurationSeconds = calls.length === 0 ? 0 : Math.round(calls.reduce((sum, c) => sum + parseDurationToSeconds(c.duration), 0) / calls.length);
  const avgDuration = avgDurationSeconds > 0 ? `${Math.floor(avgDurationSeconds / 60)}m ${avgDurationSeconds % 60}s` : "0s";

  function handleSelectCall(call: CallRecord) {
    navigate(`/calls/${call.id}`, { replace: true });
  }

  function handleRefresh() {
    queryClient.invalidateQueries({ queryKey: ["calls"] });
  }

  function handleDownload() {
    if (!calls.length) return;
    const headers = ["id", "phone", "studentName", "agentName", "campaignName", "provider", "status", "duration", "startedAt", "summary"];
    const rows = calls.map((call) => headers.map((h) => `"${String((call as unknown as Record<string, unknown>)[h] ?? "").replace(/"/g, '""')}"`).join(","));
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `call-history-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="ch-page">
      {/* Header */}
      <div className="ch-header">
        <PageHeader title="Call History" subtitle="View all conversations, transcripts, and analytics" />
        <div className="ch-header__actions">
          <Button onClick={handleRefresh}>
            <RefreshCw size={14} />
            <span>Refresh</span>
          </Button>
          <Button onClick={handleDownload}>
            <Download size={14} />
            <span>Export CSV</span>
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="ch-stats">
        <div className="ch-stat">
          <div className="ch-stat__icon ch-stat__icon--blue"><Phone size={16} /></div>
          <div>
            <div className="ch-stat__value">{calls.length}</div>
            <div className="ch-stat__label">Total Calls</div>
          </div>
        </div>
        <div className="ch-stat">
          <div className="ch-stat__icon ch-stat__icon--green"><Phone size={16} /></div>
          <div>
            <div className="ch-stat__value">{completedCount}</div>
            <div className="ch-stat__label">Completed</div>
          </div>
        </div>
        <div className="ch-stat">
          <div className="ch-stat__icon ch-stat__icon--red"><Phone size={16} /></div>
          <div>
            <div className="ch-stat__value">{failedCount}</div>
            <div className="ch-stat__label">Failed</div>
          </div>
        </div>
        <div className="ch-stat">
          <div className="ch-stat__icon ch-stat__icon--amber"><Clock size={16} /></div>
          <div>
            <div className="ch-stat__value">{avgDuration}</div>
            <div className="ch-stat__label">Avg Duration</div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="ch-filters">
        <div className="ch-search">
          <Search size={15} className="ch-search__icon" />
          <Input
            placeholder="Search by call ID or phone number..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Select value={providerFilter} onChange={(e) => setProviderFilter(e.target.value)}>
          <option value="all">All Providers</option>
          <option value="plivo">Plivo</option>
          <option value="exotel">Exotel</option>
        </Select>
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="all">All Status</option>
          <option value="Completed">Completed</option>
          <option value="Failed">Failed</option>
          <option value="Running">Running</option>
          <option value="No Answer">No Answer</option>
        </Select>
      </div>

      {/* Main content: call list + transcript */}
      <div className="ch-body">
        {/* Call list */}
        <div className="ch-list">
          {isLoading ? (
            <Card className="ch-list__empty">Loading calls...</Card>
          ) : filteredCalls.length === 0 ? (
            <Card className="ch-list__empty">
              <EmptyState compact title="No calls found" description={searchQuery ? "Try a different search query." : "Calls will appear here after you make them."} />
            </Card>
          ) : (
            filteredCalls.map((call) => (
              <div
                key={call.id}
                className={`ch-call-card ${selectedCall?.id === call.id ? "ch-call-card--active" : ""}`}
                onClick={() => handleSelectCall(call)}
              >
                <div className="ch-call-card__top">
                  <div className="ch-call-card__id">{call.id.slice(0, 8)}</div>
                  <StatusBadge tone={statusTone(call.status)}>{call.status}</StatusBadge>
                </div>
                <div className="ch-call-card__details">
                  <span className="ch-call-card__phone">{call.phone || "Unknown"}</span>
                  <span className="ch-call-card__dot" />
                  <span>{call.provider}</span>
                  <span className="ch-call-card__dot" />
                  <span>{call.duration}</span>
                </div>
                <div className="ch-call-card__meta">
                  <span>{call.agentName || "—"}</span>
                  <span>{call.startedAt}</span>
                </div>
                <ChevronRight size={14} className="ch-call-card__chevron" />
              </div>
            ))
          )}
        </div>

        {/* Transcript panel */}
        <div className="ch-transcript">
          {selectedCall ? (
            <>
              {/* Call info header */}
              <div className="ch-transcript__header">
                <h3>Call Details</h3>
                <StatusBadge tone={statusTone(selectedCall.status)}>{selectedCall.status}</StatusBadge>
              </div>

              <div className="ch-transcript__info">
                <div className="ch-transcript__info-row">
                  <span className="ch-transcript__info-label">Call ID</span>
                  <span className="ch-transcript__info-value">{selectedCall.id.slice(0, 16)}...</span>
                </div>
                <div className="ch-transcript__info-row">
                  <span className="ch-transcript__info-label">Phone</span>
                  <span className="ch-transcript__info-value">{selectedCall.phone || "—"}</span>
                </div>
                <div className="ch-transcript__info-row">
                  <span className="ch-transcript__info-label">Agent</span>
                  <span className="ch-transcript__info-value">{selectedCall.agentName || "—"}</span>
                </div>
                <div className="ch-transcript__info-row">
                  <span className="ch-transcript__info-label">Duration</span>
                  <span className="ch-transcript__info-value">{selectedCall.duration}</span>
                </div>
                <div className="ch-transcript__info-row">
                  <span className="ch-transcript__info-label">Provider</span>
                  <span className="ch-transcript__info-value">{selectedCall.provider}</span>
                </div>
                <div className="ch-transcript__info-row">
                  <span className="ch-transcript__info-label">Time</span>
                  <span className="ch-transcript__info-value">{selectedCall.startedAt}</span>
                </div>
              </div>

              {/* Summary */}
              {selectedCall.summary ? (
                <div className="ch-transcript__section">
                  <div className="ch-transcript__section-title">
                    <FileText size={14} />
                    <span>AI Summary</span>
                  </div>
                  <div className="ch-transcript__summary">{selectedCall.summary}</div>
                </div>
              ) : null}

              {/* Transcript */}
              <div className="ch-transcript__section">
                <div className="ch-transcript__section-title">
                  <FileText size={14} />
                  <span>Conversation ({selectedCall.transcript.length} turns)</span>
                </div>
                {selectedCall.transcript.length ? (
                  <div className="ch-transcript__messages">
                    {selectedCall.transcript.map((line, index) => (
                      <div key={index} className={`ch-msg ${line.speaker === "Bot" ? "ch-msg--bot" : "ch-msg--user"}`}>
                        <div className={`ch-msg__avatar ${line.speaker === "Bot" ? "ch-msg__avatar--bot" : "ch-msg__avatar--user"}`}>
                          {line.speaker === "Bot" ? <Bot size={14} /> : <User size={14} />}
                        </div>
                        <div className="ch-msg__content">
                          <div className="ch-msg__speaker">{line.speaker === "Bot" ? "Agent" : "Candidate"}</div>
                          <div className="ch-msg__text">{line.text}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="ch-transcript__empty">No transcript available for this call.</div>
                )}
              </div>
            </>
          ) : (
            <div className="ch-transcript__placeholder">
              <Phone size={32} />
              <p>Select a call to view its transcript and details</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
