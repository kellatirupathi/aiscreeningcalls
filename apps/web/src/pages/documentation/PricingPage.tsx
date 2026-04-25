import { useMemo, useState } from "react";
import { IndianRupee, ArrowLeft, Zap, Calculator } from "lucide-react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/Card";

// USD → INR conversion used across all estimates.
const USD_TO_INR = 84.1;

// ─── Provider catalogue ────────────────────────────────────────────────────
// All rates are ₹ per MINUTE of call duration (what the candidate is actually
// on the line). LLM/TTS rates assume typical voice-agent usage: ~60% agent
// speaking time, ~40 conversational turns per 7-min call.

type Provider = {
  id: string;
  name: string;
  model?: string;
  ratePerMin: number; // ₹ / minute of call
  note: string;
  monthlyBase?: number; // ₹ fixed monthly (subscriptions, phone rental)
};

type Category = "telephony" | "stt" | "llm" | "tts";

const providers: Record<Category, Provider[]> = {
  telephony: [
    { id: "plivo", name: "Plivo", ratePerMin: 0.74, monthlyBase: 250, note: "India outbound, 60-sec billing. Default." },
    { id: "exotel", name: "Exotel", ratePerMin: 0.60, monthlyBase: 200, note: "India-focused, slightly cheaper" },
    { id: "twilio", name: "Twilio", ratePerMin: 1.50, monthlyBase: 120, note: "Global, ~2× cost" },
    { id: "vonage", name: "Vonage", ratePerMin: 1.20, monthlyBase: 150, note: "Moderate cost, good for voice APIs" },
    { id: "sip", name: "SIP trunk", ratePerMin: 0.40, monthlyBase: 500, note: "At volume; needs separate media infra" }
  ],
  stt: [
    { id: "deepgram-nova3", name: "Deepgram", model: "Nova-3", ratePerMin: 0.65, note: "Has VAD UtteranceEnd, Indian-accent strong. Default." },
    { id: "assemblyai", name: "AssemblyAI", model: "best", ratePerMin: 0.35, note: "~45% cheaper, no VAD → +1s latency" },
    { id: "cartesia-ink", name: "Cartesia Ink", model: "ink-whisper", ratePerMin: 0.25, note: "Cheapest, no UtteranceEnd signal" },
    { id: "openai-whisper", name: "OpenAI Whisper", model: "whisper-1", ratePerMin: 0.50, note: "Weaker on Indian accent" },
    { id: "google-speech", name: "Google Speech", model: "latest_long", ratePerMin: 2.02, note: "3× cost, 15-sec billing rounds" }
  ],
  llm: [
    { id: "groq-8b", name: "Groq", model: "llama-3.1-8b-instant", ratePerMin: 0.02, note: "Fastest, but hallucinates in complex dialog. Default." },
    { id: "groq-70b", name: "Groq", model: "llama-3.3-70b-versatile", ratePerMin: 0.15, note: "Much better rule-following than 8B" },
    { id: "openai-mini", name: "OpenAI", model: "gpt-4o-mini", ratePerMin: 0.12, note: "Reliable, ~500ms TTFT" },
    { id: "openai-4o", name: "OpenAI", model: "gpt-4o", ratePerMin: 1.80, note: "Best quality, 60× cost" },
    { id: "gemini-25-flash-lite", name: "Google Gemini", model: "gemini-2.5-flash-lite", ratePerMin: 0.04, note: "Gemini default — fastest + cheapest" },
    { id: "gemini-25-flash", name: "Google Gemini", model: "gemini-2.5-flash", ratePerMin: 0.09, note: "Balanced — strong reasoning + JSON" },
    { id: "gemini-25-pro", name: "Google Gemini", model: "gemini-2.5-pro", ratePerMin: 0.60, note: "Best reasoning, slower" },
    { id: "gemini-20-flash-lite", name: "Google Gemini", model: "gemini-2.0-flash-lite", ratePerMin: 0.03, note: "Older, cheap" }
  ],
  tts: [
    { id: "cartesia-sonic3", name: "Cartesia", model: "sonic-3", ratePerMin: 1.51, monthlyBase: 3280, note: "Lowest TTFB (~90ms). Startup plan $39/mo. Default." },
    { id: "cartesia-turbo", name: "Cartesia", model: "sonic-turbo", ratePerMin: 1.30, monthlyBase: 3280, note: "Slightly faster than sonic-3, lower quality" },
    { id: "smallest-ai", name: "Smallest.ai", model: "lightning", ratePerMin: 0.50, note: "~66% cheaper, decent quality" },
    { id: "deepgram-aura", name: "Deepgram Aura-2", model: "thalia", ratePerMin: 0.90, note: "Bundled with STT, pay-as-you-go" },
    { id: "elevenlabs-turbo", name: "ElevenLabs", model: "turbo v2.5", ratePerMin: 2.50, note: "Most natural, slower" },
    { id: "openai-tts", name: "OpenAI TTS", model: "tts-1", ratePerMin: 1.00, note: "Simple, ~500ms latency" },
    { id: "sarvam-bulbul", name: "Sarvam", model: "bulbul:v3", ratePerMin: 0.80, note: "Indian-language support, REST (slow)" },
    { id: "azure-neural", name: "Azure Neural", model: "en-IN-NeeraNeural", ratePerMin: 0.80, note: "Enterprise, SSML-rich" }
  ]
};

const categoryLabels: Record<Category, string> = {
  telephony: "Telephony",
  stt: "Speech-to-Text",
  llm: "LLM",
  tts: "Text-to-Speech"
};

const categoryOrder: Category[] = ["telephony", "stt", "llm", "tts"];

const defaultSelection: Record<Category, string> = {
  telephony: "plivo",
  stt: "deepgram-nova3",
  llm: "groq-8b",
  tts: "cartesia-sonic3"
};

const INR = (n: number) =>
  `₹${n.toLocaleString("en-IN", { maximumFractionDigits: n < 10 ? 2 : 0 })}`;

const USD = (inr: number) => `$${(inr / USD_TO_INR).toFixed(2)}`;

export default function PricingPage() {
  const [selected, setSelected] = useState<Record<Category, string>>(defaultSelection);
  const [callsPerMonth, setCallsPerMonth] = useState<number>(1000);
  const [minutesPerCall, setMinutesPerCall] = useState<number>(7);

  const getProvider = (cat: Category): Provider => {
    const list = providers[cat];
    const id = selected[cat];
    return list.find((p) => p.id === id) ?? list[0]!;
  };

  const selectedProviders = useMemo(
    () => ({
      telephony: getProvider("telephony"),
      stt: getProvider("stt"),
      llm: getProvider("llm"),
      tts: getProvider("tts")
    }),
    [selected]
  );

  const breakdown = useMemo(() => {
    const totalMinutes = callsPerMonth * minutesPerCall;
    const rows = categoryOrder.map((cat) => {
      const p = selectedProviders[cat];
      const usage = p.ratePerMin * totalMinutes;
      const base = p.monthlyBase ?? 0;
      return {
        category: cat,
        provider: p,
        perMin: p.ratePerMin,
        perCall: p.ratePerMin * minutesPerCall,
        monthlyUsage: usage,
        monthlyBase: base,
        monthlyTotal: usage + base
      };
    });
    const totalMonthly = rows.reduce((s, r) => s + r.monthlyTotal, 0);
    const totalPerMin = totalMonthly / Math.max(1, totalMinutes);
    const totalPerCall = totalMonthly / Math.max(1, callsPerMonth);
    return { rows, totalMonthly, totalPerMin, totalPerCall, totalMinutes };
  }, [selectedProviders, callsPerMonth, minutesPerCall]);

  const volumeScenarios = useMemo(() => {
    return [1000, 2000, 3000].map((volume) => {
      const totalMinutes = volume * minutesPerCall;
      const perMinSum = categoryOrder.reduce(
        (s, cat) => s + selectedProviders[cat].ratePerMin,
        0
      );
      const baseSum = categoryOrder.reduce(
        (s, cat) => s + (selectedProviders[cat].monthlyBase ?? 0),
        0
      );
      const usage = perMinSum * totalMinutes;
      const total = usage + baseSum;
      return {
        volume,
        totalMinutes,
        perCallCost: perMinSum * minutesPerCall,
        usage,
        base: baseSum,
        total,
        perMin: total / Math.max(1, totalMinutes)
      };
    });
  }, [selectedProviders, minutesPerCall]);

  return (
    <div className="doc">
      <aside className="doc__sidebar">
        <div className="doc__brand">
          <div className="doc__brand-icon"><Zap size={18} /></div>
          <div>
            <div className="doc__brand-name">NxtWave</div>
            <div className="doc__brand-sub">Voice Screening Docs</div>
          </div>
        </div>
        <nav className="doc__nav">
          <Link to="/documentation" className="doc__nav-item">
            <ArrowLeft size={15} />
            <span>Back to Documentation</span>
          </Link>
          <button className="doc__nav-item doc__nav-item--active">
            <IndianRupee size={15} />
            <span>Pricing & Costs</span>
          </button>
        </nav>
        <div className="doc__nav-footer">
          <Link to="/dashboard" className="doc__nav-item">
            <ArrowLeft size={15} />
            <span>Back to Dashboard</span>
          </Link>
        </div>
      </aside>

      <main className="doc__main">
        <div className="doc__content">
          <div className="doc__header">
            <div className="doc__badge">Pricing</div>
            <h1>Cost Calculator</h1>
            <p>
              Estimate monthly cost based on your provider choices and call volume.
              Defaults match the production stack: <strong>Plivo + Deepgram + Groq + Cartesia</strong>.
              Change any dropdown to see how the cost shifts.
            </p>
          </div>

          <section className="doc__section">
            {/* ── Configuration ──────────────────────────────────────────── */}
            <Card className="doc__feature-card" style={{ padding: 20 }}>
              <h3 style={{ margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
                <Calculator size={18} /> Configure your stack
              </h3>
              <p style={{ margin: "6px 0 14px", fontSize: 13, color: "var(--text-muted)" }}>
                Pick one provider per category, set call volume, and the table below updates live.
              </p>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
                {categoryOrder.map((cat) => {
                  const p = selectedProviders[cat];
                  return (
                    <div key={cat}>
                      <label style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em", color: "var(--text-muted)" }}>
                        {categoryLabels[cat]}
                      </label>
                      <select
                        value={selected[cat]}
                        onChange={(e) => setSelected((prev) => ({ ...prev, [cat]: e.target.value }))}
                        style={{
                          width: "100%",
                          padding: "8px 10px",
                          marginTop: 4,
                          borderRadius: 8,
                          border: "1px solid var(--card-border)",
                          background: "#fff",
                          fontSize: 13
                        }}
                      >
                        {providers[cat].map((opt) => (
                          <option key={opt.id} value={opt.id}>
                            {opt.name}{opt.model ? ` · ${opt.model}` : ""} — {INR(opt.ratePerMin)}/min
                          </option>
                        ))}
                      </select>
                      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4, minHeight: 30 }}>
                        {p.note}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginTop: 18, paddingTop: 14, borderTop: "1px solid var(--card-border)" }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em", color: "var(--text-muted)" }}>
                    Calls per month
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={callsPerMonth}
                    onChange={(e) => setCallsPerMonth(Math.max(1, parseInt(e.target.value) || 1))}
                    style={{
                      width: "100%", padding: "8px 10px", marginTop: 4,
                      borderRadius: 8, border: "1px solid var(--card-border)", background: "#fff", fontSize: 13
                    }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em", color: "var(--text-muted)" }}>
                    Avg minutes per call
                  </label>
                  <input
                    type="number"
                    min={1}
                    step={0.5}
                    value={minutesPerCall}
                    onChange={(e) => setMinutesPerCall(Math.max(1, parseFloat(e.target.value) || 1))}
                    style={{
                      width: "100%", padding: "8px 10px", marginTop: 4,
                      borderRadius: 8, border: "1px solid var(--card-border)", background: "#fff", fontSize: 13
                    }}
                  />
                </div>
                <div style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em", color: "var(--text-muted)" }}>
                    Total minutes/mo
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", marginTop: 4 }}>
                    {breakdown.totalMinutes.toLocaleString("en-IN")}
                  </div>
                </div>
              </div>
            </Card>

            {/* ── Summary cards ──────────────────────────────────────────── */}
            <div className="doc__grid doc__grid--3" style={{ marginTop: 18 }}>
              <Card className="doc__feature-card">
                <h3>Per minute</h3>
                <p style={{ fontSize: 22, fontWeight: 700, color: "var(--blue)", margin: "6px 0 4px" }}>
                  {INR(breakdown.totalPerMin)}
                </p>
                <p>{USD(breakdown.totalPerMin)} USD blended</p>
              </Card>
              <Card className="doc__feature-card">
                <h3>Per call ({minutesPerCall} min)</h3>
                <p style={{ fontSize: 22, fontWeight: 700, color: "var(--blue)", margin: "6px 0 4px" }}>
                  {INR(breakdown.totalPerCall)}
                </p>
                <p>{USD(breakdown.totalPerCall)} USD per candidate</p>
              </Card>
              <Card className="doc__feature-card">
                <h3>Monthly total</h3>
                <p style={{ fontSize: 22, fontWeight: 700, color: "var(--blue)", margin: "6px 0 4px" }}>
                  {INR(breakdown.totalMonthly)}
                </p>
                <p>{USD(breakdown.totalMonthly)} USD · {callsPerMonth.toLocaleString("en-IN")} calls</p>
              </Card>
            </div>

            {/* ── Detailed per-provider breakdown ───────────────────────── */}
            <h3 style={{ marginTop: 28, marginBottom: 8, fontSize: 16 }}>
              Breakdown by provider · {callsPerMonth.toLocaleString("en-IN")} calls × {minutesPerCall} min
            </h3>
            <div style={{ overflowX: "auto", border: "1px solid var(--card-border)", borderRadius: 12, background: "#fff" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "var(--slate-soft)", fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".04em" }}>
                    <th style={{ padding: "10px 14px", textAlign: "left" }}>Service</th>
                    <th style={{ padding: "10px 14px", textAlign: "left" }}>Provider · Model</th>
                    <th style={{ padding: "10px 14px", textAlign: "right" }}>₹/min</th>
                    <th style={{ padding: "10px 14px", textAlign: "right" }}>Per call</th>
                    <th style={{ padding: "10px 14px", textAlign: "right" }}>Usage ₹/mo</th>
                    <th style={{ padding: "10px 14px", textAlign: "right" }}>Base ₹/mo</th>
                    <th style={{ padding: "10px 14px", textAlign: "right" }}>Total ₹/mo</th>
                  </tr>
                </thead>
                <tbody>
                  {breakdown.rows.map((r) => (
                    <tr key={r.category} style={{ borderTop: "1px solid var(--card-border)" }}>
                      <td style={{ padding: "10px 14px", fontWeight: 600 }}>{categoryLabels[r.category]}</td>
                      <td style={{ padding: "10px 14px", color: "var(--text-secondary)" }}>
                        {r.provider.name}{r.provider.model ? ` · ${r.provider.model}` : ""}
                      </td>
                      <td style={{ padding: "10px 14px", textAlign: "right", color: "var(--text-secondary)" }}>{INR(r.perMin)}</td>
                      <td style={{ padding: "10px 14px", textAlign: "right", color: "var(--text-secondary)" }}>{INR(r.perCall)}</td>
                      <td style={{ padding: "10px 14px", textAlign: "right", color: "var(--text-secondary)" }}>{INR(r.monthlyUsage)}</td>
                      <td style={{ padding: "10px 14px", textAlign: "right", color: r.monthlyBase > 0 ? "var(--text-secondary)" : "var(--text-muted)" }}>
                        {r.monthlyBase > 0 ? INR(r.monthlyBase) : "—"}
                      </td>
                      <td style={{ padding: "10px 14px", textAlign: "right", fontWeight: 700 }}>{INR(r.monthlyTotal)}</td>
                    </tr>
                  ))}
                  <tr style={{ borderTop: "2px solid var(--card-border)", background: "#f0f7ff" }}>
                    <td style={{ padding: "12px 14px", fontWeight: 700, color: "var(--blue)" }} colSpan={6}>
                      Total monthly cost ({callsPerMonth.toLocaleString("en-IN")} calls · {breakdown.totalMinutes.toLocaleString("en-IN")} min)
                    </td>
                    <td style={{ padding: "12px 14px", textAlign: "right", fontWeight: 700, color: "var(--blue)", fontSize: 15 }}>
                      {INR(breakdown.totalMonthly)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* ── Volume scenarios ──────────────────────────────────────── */}
            <h3 style={{ marginTop: 28, marginBottom: 8, fontSize: 16 }}>
              Volume scenarios with current stack
            </h3>
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 0 }}>
              How cost scales from 1,000 → 3,000 calls/month with your selected providers ({minutesPerCall} min per call).
            </p>
            <div style={{ overflowX: "auto", border: "1px solid var(--card-border)", borderRadius: 12, background: "#fff" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "var(--slate-soft)", fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".04em" }}>
                    <th style={{ padding: "10px 14px", textAlign: "left" }}>Volume</th>
                    <th style={{ padding: "10px 14px", textAlign: "right" }}>Total minutes</th>
                    <th style={{ padding: "10px 14px", textAlign: "right" }}>Per call</th>
                    <th style={{ padding: "10px 14px", textAlign: "right" }}>Usage</th>
                    <th style={{ padding: "10px 14px", textAlign: "right" }}>Fixed base</th>
                    <th style={{ padding: "10px 14px", textAlign: "right" }}>Monthly ₹</th>
                    <th style={{ padding: "10px 14px", textAlign: "right" }}>Monthly USD</th>
                    <th style={{ padding: "10px 14px", textAlign: "right" }}>₹/min</th>
                  </tr>
                </thead>
                <tbody>
                  {volumeScenarios.map((s) => (
                    <tr key={s.volume} style={{ borderTop: "1px solid var(--card-border)" }}>
                      <td style={{ padding: "10px 14px", fontWeight: 600 }}>{s.volume.toLocaleString("en-IN")} calls</td>
                      <td style={{ padding: "10px 14px", textAlign: "right", color: "var(--text-secondary)" }}>{s.totalMinutes.toLocaleString("en-IN")}</td>
                      <td style={{ padding: "10px 14px", textAlign: "right", color: "var(--text-secondary)" }}>{INR(s.perCallCost)}</td>
                      <td style={{ padding: "10px 14px", textAlign: "right", color: "var(--text-secondary)" }}>{INR(s.usage)}</td>
                      <td style={{ padding: "10px 14px", textAlign: "right", color: s.base > 0 ? "var(--text-secondary)" : "var(--text-muted)" }}>
                        {s.base > 0 ? INR(s.base) : "—"}
                      </td>
                      <td style={{ padding: "10px 14px", textAlign: "right", fontWeight: 700 }}>{INR(s.total)}</td>
                      <td style={{ padding: "10px 14px", textAlign: "right", color: "var(--text-secondary)" }}>{USD(s.total)}</td>
                      <td style={{ padding: "10px 14px", textAlign: "right", color: "var(--text-secondary)" }}>{INR(s.perMin)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* ── Provider catalogue ───────────────────────────────────── */}
            <h3 style={{ marginTop: 28, marginBottom: 8, fontSize: 16 }}>All provider options</h3>
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 0 }}>
              Complete rate card for every provider in each category. Currently selected providers are highlighted.
            </p>

            <div className="doc__grid doc__grid--2" style={{ gap: 12 }}>
              {categoryOrder.map((cat) => (
                <Card key={cat} className="doc__feature-card" style={{ padding: 16 }}>
                  <h3 style={{ margin: 0 }}>{categoryLabels[cat]}</h3>
                  <ul style={{ margin: "8px 0 0", padding: 0, listStyle: "none", display: "grid", gap: 6 }}>
                    {providers[cat].map((p) => {
                      const isSelected = selected[cat] === p.id;
                      return (
                        <li
                          key={p.id}
                          style={{
                            padding: "8px 10px",
                            borderRadius: 8,
                            background: isSelected ? "#f0f7ff" : "transparent",
                            border: isSelected ? "1px solid var(--blue)" : "1px solid transparent",
                            display: "grid",
                            gridTemplateColumns: "1fr auto",
                            gap: 8,
                            fontSize: 12
                          }}
                        >
                          <div>
                            <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                              {p.name}{p.model ? ` · ${p.model}` : ""}
                              {isSelected && (
                                <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 4, background: "var(--blue)", color: "#fff", marginLeft: 6 }}>
                                  SELECTED
                                </span>
                              )}
                            </div>
                            <div style={{ color: "var(--text-muted)", marginTop: 2 }}>{p.note}</div>
                          </div>
                          <div style={{ textAlign: "right", fontWeight: 700, color: "var(--blue)", whiteSpace: "nowrap" }}>
                            {INR(p.ratePerMin)}/min
                            {p.monthlyBase ? (
                              <div style={{ fontSize: 10, fontWeight: 500, color: "var(--text-muted)" }}>
                                + {INR(p.monthlyBase)}/mo
                              </div>
                            ) : null}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </Card>
              ))}
            </div>

            {/* ── Footnotes ─────────────────────────────────────────────── */}
            <div className="doc__callout" style={{ marginTop: 18 }}>
              <strong>How the numbers are calculated</strong>
              <pre><code>{`• Per-minute rate = the provider's usage cost per minute of CALL time
  (not minute of agent speech, not minute of audio generated).
• Fixed base = monthly subscription + phone number rental (independent of call volume).
  - Plivo: ~₹250/mo DID rental
  - Cartesia Startup plan: $39/mo (₹3,280) — needed for 5+ concurrent TTS
• LLM rate assumes ~30 conversation turns × ~400 input tokens (growing history)
  × ~60 output tokens per turn, averaged over call duration.
• TTS rate assumes agent speaks ~60% of the call.
• Plivo bills in 60-sec rounded increments.
• Deepgram streams full call duration (not just speech).
• USD → INR at ₹84.1/USD (April 2026).`}</code></pre>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
