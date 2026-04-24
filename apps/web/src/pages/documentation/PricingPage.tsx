import { IndianRupee, ArrowLeft, Zap } from "lucide-react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/Card";

// All rates current as of April 2026. USD → INR at ₹84.1/USD.
const pricingProviders = [
  {
    name: "Plivo",
    role: "Telephony",
    required: true,
    why: "Dials the actual phone call and streams audio both directions over WebSocket in real time. Chosen over Twilio because India outbound is ~50% cheaper.",
    rate: "₹0.74/min",
    rateNote: "60-sec billing, India outbound + ₹250/mo number rental",
    alternatives: [
      { name: "Exotel", price: "₹0.60/min", note: "slightly cheaper, India-focused, already integrated" },
      { name: "Twilio", price: "₹1.50/min", note: "~2× more expensive" },
      { name: "Vonage", price: "₹1.20/min", note: "moderate" },
      { name: "SIP trunk", price: "₹0.30-0.50/min", note: "at volume, needs separate media infra" }
    ]
  },
  {
    name: "Deepgram",
    role: "Speech-to-Text",
    required: false,
    why: "Converts candidate's voice into text in real time. Nova-3 has UtteranceEnd VAD — tells us when candidate stopped speaking, letting agent respond ~800ms faster.",
    rate: "$0.0077/min (₹0.65)",
    rateNote: "Nova-3 streaming, billed per-second",
    alternatives: [
      { name: "AssemblyAI", price: "$0.0042/min", note: "~45% cheaper, no VAD → +1s latency" },
      { name: "Cartesia Ink", price: "$0.003/min", note: "cheapest, no UtteranceEnd" },
      { name: "OpenAI Whisper", price: "$0.006/min", note: "weaker Indian accent accuracy" },
      { name: "Google Speech", price: "$0.024/min", note: "~3× more, 15-sec rounding wastes money" }
    ]
  },
  {
    name: "Groq",
    role: "LLM Inference",
    required: false,
    why: "Reads conversation history and decides what agent says next. llama-3.1-8b-instant on Groq chosen for speed — 660+ tokens/sec means LLM starts responding in ~200ms vs 800ms on OpenAI.",
    rate: "₹0.02/min",
    rateNote: "$0.05/M input, $0.08/M output — extremely cheap",
    alternatives: [
      { name: "Groq llama-3.3-70b", price: "₹0.15/min", note: "7× cost, much better rule-following — recommended" },
      { name: "OpenAI gpt-4o-mini", price: "₹0.12/min", note: "reliable, ~600ms first token" },
      { name: "OpenAI gpt-4o", price: "₹1.80/min", note: "best quality, 60× cost" },
      { name: "Claude 3.5 Haiku", price: "₹0.30/min", note: "strong reasoning, moderate speed" }
    ]
  },
  {
    name: "Cartesia",
    role: "Text-to-Speech",
    required: false,
    why: "Turns LLM's text reply into human-sounding audio. Sonic-3 has 40-90ms time-to-first-audio — fastest on market. Supports streaming so agent starts speaking first sentence while rest still synthesizing.",
    rate: "₹1.51/min",
    rateNote: "$0.03/min of audio (~60% of call = agent speaking)",
    alternatives: [
      { name: "Smallest.ai", price: "₹0.50/min", note: "~66% cheaper, 2500-char limit vs 500" },
      { name: "Deepgram Aura-2", price: "₹0.90/min", note: "bundled with STT = one vendor" },
      { name: "ElevenLabs Turbo", price: "₹2.50/min", note: "highest quality, most natural, slower" },
      { name: "OpenAI TTS", price: "₹1.00/min", note: "simpler, 300ms+ latency" },
      { name: "Azure Neural TTS", price: "₹0.80/min", note: "enterprise, SSML-rich" }
    ]
  }
];

const pricingVolumeScenarios = [
  { volume: "100 calls", minutes: 500, plivo: "₹370", deepgram: "₹324", groq: "₹12", cartesia: "₹757", total: "₹1,463", perMin: "₹2.93", usd: "$17" },
  { volume: "250 calls", minutes: 1250, plivo: "₹925", deepgram: "₹809", groq: "₹31", cartesia: "₹1,893", total: "₹3,658", perMin: "₹2.93", usd: "$44" },
  { volume: "500 calls", minutes: 2500, plivo: "₹1,850", deepgram: "₹1,619", groq: "₹63", cartesia: "₹3,785", total: "₹7,317", perMin: "₹2.93", usd: "$87", highlighted: true },
  { volume: "1,000 calls", minutes: 5000, plivo: "₹3,700", deepgram: "₹3,238", groq: "₹125", cartesia: "₹7,570", total: "₹14,633", perMin: "₹2.93", usd: "$174" },
  { volume: "5,000 calls", minutes: 25000, plivo: "₹18,500", deepgram: "₹16,188", groq: "₹625", cartesia: "₹37,850", total: "₹73,163", perMin: "₹2.93", usd: "$870" },
  { volume: "10,000 calls", minutes: 50000, plivo: "₹37,000", deepgram: "₹32,375", groq: "₹1,250", cartesia: "₹75,700", total: "₹1,46,325", perMin: "₹2.93", usd: "$1,740" }
];

const pricingStacks = [
  {
    label: "Current",
    config: "Plivo + Deepgram + Groq-8b + Cartesia",
    plivo: "₹1,850", stt: "₹1,619", llm: "₹63", tts: "₹3,785",
    total: "₹7,317", perMin: "₹2.93"
  },
  {
    label: "Budget",
    config: "Plivo + AssemblyAI + DeepInfra-8b + Smallest.ai",
    plivo: "₹1,850", stt: "₹883", llm: "₹7", tts: "₹1,250",
    total: "₹3,990", perMin: "₹1.60", cheapest: true
  },
  {
    label: "Recommended",
    config: "Plivo + Deepgram + Groq-70b + Smallest.ai",
    plivo: "₹1,850", stt: "₹1,619", llm: "₹378", tts: "₹1,250",
    total: "₹5,097", perMin: "₹2.04", recommended: true
  },
  {
    label: "Premium",
    config: "Plivo + Deepgram + gpt-4o-mini + ElevenLabs",
    plivo: "₹1,850", stt: "₹1,619", llm: "₹302", tts: "₹6,250",
    total: "₹10,021", perMin: "₹4.01"
  },
  {
    label: "Best quality",
    config: "Plivo + Deepgram + gpt-4o + ElevenLabs",
    plivo: "₹1,850", stt: "₹1,619", llm: "₹4,525", tts: "₹6,250",
    total: "₹14,244", perMin: "₹5.70"
  }
];

export default function PricingPage() {
  return (
    <div className="doc">
      {/* Sidebar */}
      <aside className="doc__sidebar">
        <div className="doc__brand">
          <div className="doc__brand-icon">
            <Zap size={18} />
          </div>
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

      {/* Main content */}
      <main className="doc__main">
        <div className="doc__content">
          {/* Header */}
          <div className="doc__header">
            <div className="doc__badge">Pricing</div>
            <h1>Pricing & Costs</h1>
            <p>
              Full cost breakdown of the voice pipeline. All rates as of April 2026.
              A typical 5-minute call costs <strong>₹14.63 (~$0.17 USD)</strong> end-to-end.
              500 calls/month (~2,500 minutes) ≈ <strong>₹7,317 (~$87)</strong>.
            </p>
          </div>

          <section className="doc__section">
            {/* Cost summary cards */}
            <div className="doc__grid doc__grid--3" style={{ marginTop: 14 }}>
              <Card className="doc__feature-card">
                <h3>Cost per minute</h3>
                <p style={{ fontSize: 22, fontWeight: 700, color: "var(--blue)", margin: "6px 0 4px" }}>₹2.93</p>
                <p>~$0.035 USD — blended across all 4 providers</p>
              </Card>
              <Card className="doc__feature-card">
                <h3>Cost per 5-min call</h3>
                <p style={{ fontSize: 22, fontWeight: 700, color: "var(--blue)", margin: "6px 0 4px" }}>₹14.63</p>
                <p>~$0.17 USD — single candidate screening</p>
              </Card>
              <Card className="doc__feature-card">
                <h3>Biggest cost driver</h3>
                <p style={{ fontSize: 22, fontWeight: 700, color: "#b45309", margin: "6px 0 4px" }}>Cartesia TTS</p>
                <p>52% of total — agent speaks ~60% of every call</p>
              </Card>
            </div>

            {/* Provider explainer */}
            <h3 style={{ marginTop: 28, marginBottom: 8, fontSize: 16 }}>Why each provider & alternatives</h3>
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 0 }}>
              Every provider serves exactly one responsibility. Alternatives shown with per-minute cost and key trade-off.
            </p>

            <div className="doc__grid doc__grid--1" style={{ gap: 12 }}>
              {pricingProviders.map((p) => (
                <Card key={p.name} className="doc__feature-card" style={{ padding: 18 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                    <div>
                      <h3 style={{ margin: 0 }}>
                        {p.name}
                        <span style={{
                          fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 999,
                          background: "var(--blue-soft)", color: "var(--blue)", marginLeft: 8
                        }}>
                          {p.role}
                        </span>
                        {p.required && (
                          <span style={{
                            fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 999,
                            background: "#fef3c7", color: "#92400e", marginLeft: 6
                          }}>
                            required
                          </span>
                        )}
                      </h3>
                      <p style={{ marginTop: 8, fontSize: 13 }}>{p.why}</p>
                    </div>
                    <div style={{ textAlign: "right", minWidth: 140 }}>
                      <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)" }}>{p.rate}</div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{p.rateNote}</div>
                    </div>
                  </div>
                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--card-border)" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 6 }}>
                      Alternatives
                    </div>
                    <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 4 }}>
                      {p.alternatives.map((alt) => (
                        <li key={alt.name} style={{ fontSize: 12, color: "var(--text-secondary)", display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <span style={{ fontWeight: 600, color: "var(--text-primary)", minWidth: 160 }}>{alt.name}</span>
                          <span style={{ fontWeight: 600, color: "var(--blue)" }}>{alt.price}</span>
                          <span>— {alt.note}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </Card>
              ))}
            </div>

            {/* Volume scenarios table */}
            <h3 style={{ marginTop: 28, marginBottom: 8, fontSize: 16 }}>Volume scenarios</h3>
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 0 }}>
              Assumes 5-minute average call. ₹/min stays flat at ₹2.93 until you cross volume-discount thresholds (10,000+ calls/month → negotiate enterprise rates, ~20-30% reduction).
            </p>

            <div style={{ overflowX: "auto", border: "1px solid var(--card-border)", borderRadius: 12, background: "#fff" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "var(--slate-soft)", fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".04em" }}>
                    <th style={{ padding: "10px 14px", textAlign: "left" }}>Volume</th>
                    <th style={{ padding: "10px 14px", textAlign: "right" }}>Minutes</th>
                    <th style={{ padding: "10px 14px", textAlign: "right" }}>Plivo</th>
                    <th style={{ padding: "10px 14px", textAlign: "right" }}>Deepgram</th>
                    <th style={{ padding: "10px 14px", textAlign: "right" }}>Groq</th>
                    <th style={{ padding: "10px 14px", textAlign: "right" }}>Cartesia</th>
                    <th style={{ padding: "10px 14px", textAlign: "right" }}>Monthly ₹</th>
                    <th style={{ padding: "10px 14px", textAlign: "right" }}>₹/min</th>
                    <th style={{ padding: "10px 14px", textAlign: "right" }}>USD</th>
                  </tr>
                </thead>
                <tbody>
                  {pricingVolumeScenarios.map((row) => (
                    <tr key={row.volume} style={{ borderTop: "1px solid var(--card-border)", background: row.highlighted ? "#f0f7ff" : "transparent" }}>
                      <td style={{ padding: "10px 14px", fontWeight: row.highlighted ? 700 : 500, color: row.highlighted ? "var(--blue)" : "var(--text-primary)" }}>
                        {row.volume}
                        {row.highlighted && <div style={{ fontSize: 11, fontWeight: 500, color: "var(--text-muted)" }}>your target</div>}
                      </td>
                      <td style={{ padding: "10px 14px", textAlign: "right", color: "var(--text-secondary)" }}>{row.minutes.toLocaleString()}</td>
                      <td style={{ padding: "10px 14px", textAlign: "right", color: "var(--text-secondary)" }}>{row.plivo}</td>
                      <td style={{ padding: "10px 14px", textAlign: "right", color: "var(--text-secondary)" }}>{row.deepgram}</td>
                      <td style={{ padding: "10px 14px", textAlign: "right", color: "var(--text-secondary)" }}>{row.groq}</td>
                      <td style={{ padding: "10px 14px", textAlign: "right", color: "var(--text-secondary)" }}>{row.cartesia}</td>
                      <td style={{ padding: "10px 14px", textAlign: "right", fontWeight: 700, color: "var(--text-primary)" }}>{row.total}</td>
                      <td style={{ padding: "10px 14px", textAlign: "right", color: "var(--text-secondary)" }}>{row.perMin}</td>
                      <td style={{ padding: "10px 14px", textAlign: "right", color: "var(--text-secondary)" }}>{row.usd}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Stack configuration comparison */}
            <h3 style={{ marginTop: 28, marginBottom: 8, fontSize: 16 }}>Cost comparison by stack</h3>
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 0 }}>
              Same 500 calls × 5 min workload, different provider combinations. Budget saves 45%, premium costs 95% more.
            </p>

            <div style={{ overflowX: "auto", border: "1px solid var(--card-border)", borderRadius: 12, background: "#fff" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "var(--slate-soft)", fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".04em" }}>
                    <th style={{ padding: "10px 14px", textAlign: "left" }}>Stack</th>
                    <th style={{ padding: "10px 14px", textAlign: "right" }}>Plivo</th>
                    <th style={{ padding: "10px 14px", textAlign: "right" }}>STT</th>
                    <th style={{ padding: "10px 14px", textAlign: "right" }}>LLM</th>
                    <th style={{ padding: "10px 14px", textAlign: "right" }}>TTS</th>
                    <th style={{ padding: "10px 14px", textAlign: "right" }}>Monthly</th>
                    <th style={{ padding: "10px 14px", textAlign: "right" }}>₹/min</th>
                  </tr>
                </thead>
                <tbody>
                  {pricingStacks.map((s) => (
                    <tr key={s.label} style={{
                      borderTop: "1px solid var(--card-border)",
                      background: s.recommended ? "#f0f7ff" : s.cheapest ? "#f0fdf4" : "transparent"
                    }}>
                      <td style={{ padding: "10px 14px" }}>
                        <div style={{ fontWeight: 700, color: "var(--text-primary)" }}>
                          {s.label}
                          {s.recommended && <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: "var(--blue)", color: "#fff", marginLeft: 6 }}>RECOMMENDED</span>}
                          {s.cheapest && <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: "#16a34a", color: "#fff", marginLeft: 6 }}>CHEAPEST</span>}
                        </div>
                        <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{s.config}</div>
                      </td>
                      <td style={{ padding: "10px 14px", textAlign: "right", color: "var(--text-secondary)" }}>{s.plivo}</td>
                      <td style={{ padding: "10px 14px", textAlign: "right", color: "var(--text-secondary)" }}>{s.stt}</td>
                      <td style={{ padding: "10px 14px", textAlign: "right", color: "var(--text-secondary)" }}>{s.llm}</td>
                      <td style={{ padding: "10px 14px", textAlign: "right", color: "var(--text-secondary)" }}>{s.tts}</td>
                      <td style={{ padding: "10px 14px", textAlign: "right", fontWeight: 700, color: "var(--text-primary)" }}>{s.total}</td>
                      <td style={{ padding: "10px 14px", textAlign: "right", color: "var(--text-secondary)" }}>{s.perMin}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Optimization tips */}
            <h3 style={{ marginTop: 28, marginBottom: 8, fontSize: 16 }}>Optimization opportunities</h3>
            <div className="doc__grid doc__grid--2">
              <Card className="doc__feature-card">
                <h3>TTS caching (biggest win)</h3>
                <p>
                  Welcome message, 10 technical questions, acknowledgments like "No problem, let's move on", "Could you explain a bit more?" — all fixed text.
                  Pre-synthesize once and cache in Redis to avoid ~40% of TTS calls.
                </p>
                <p style={{ fontWeight: 700, color: "#16a34a", marginTop: 6 }}>Saves ~₹1,500/month at 500 calls</p>
              </Card>
              <Card className="doc__feature-card">
                <h3>Switch TTS → Smallest.ai</h3>
                <p>
                  Smallest.ai at ₹0.50/min vs Cartesia ₹1.51/min — same streaming quality in most languages. Test accent quality first.
                </p>
                <p style={{ fontWeight: 700, color: "#16a34a", marginTop: 6 }}>Saves ~₹2,500/month at 500 calls</p>
              </Card>
              <Card className="doc__feature-card">
                <h3>Upgrade Groq 8b → 70b</h3>
                <p>
                  Still dirt cheap (~₹0.15/min) but dramatically better at following "no hints" rules. LLM is &lt;1% of total cost — not worth optimizing down, worth upgrading up.
                </p>
                <p style={{ fontWeight: 700, color: "var(--blue)", marginTop: 6 }}>Adds ~₹315/month, big quality win</p>
              </Card>
              <Card className="doc__feature-card">
                <h3>Fixed monthly overhead</h3>
                <p>
                  Independent of call volume: Plivo number rental ₹250, Deepgram storage ~₹50, S3 recordings ~₹15 (for 6 GB at 500 calls). Total ~₹315/mo.
                </p>
                <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 6 }}>Grand total at 500 calls: ~₹7,632/mo</p>
              </Card>
            </div>

            <div className="doc__callout" style={{ marginTop: 18 }}>
              <strong>Important billing notes</strong>
              <pre><code>{`• Plivo bills in 60-sec rounded increments — a 4m 10s call is charged as 5 min
• Cartesia cost scales with agent speech time; if agent speaks >60% of call, add 10-15%
• Groq LLM cost assumes ~30 turns × 400 input tokens (growing history) × 60 output tokens
• Deepgram streams the entire call, so full duration is billed (not just speech)
• USD ↔ INR converted at ₹84.1/USD (April 2026)`}</code></pre>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
