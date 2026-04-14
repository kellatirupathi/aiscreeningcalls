import { useState } from "react";
import {
  Bot, Database, Gauge, Mic, Network, PhoneForwarded, Settings2,
  ShieldCheck, Workflow, BookOpen, Rocket, Server, Users, Phone,
  Code, Terminal, AlertTriangle, CheckCircle, ChevronRight, Hash,
  Zap, ArrowRight
} from "lucide-react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/Card";

// ─── Data ────────────────────────────────────────────────────────────────────

const sections = [
  { id: "getting-started", label: "Getting Started", icon: Rocket },
  { id: "overview", label: "Platform Overview", icon: BookOpen },
  { id: "architecture", label: "Architecture", icon: Server },
  { id: "call-flow", label: "Call Flow", icon: Phone },
  { id: "agents", label: "Agent Builder", icon: Bot },
  { id: "operations", label: "Campaigns & Batches", icon: PhoneForwarded },
  { id: "providers", label: "Providers", icon: Network },
  { id: "data-model", label: "Data Model", icon: Database },
  { id: "roles", label: "Roles & Access", icon: Users },
  { id: "environment", label: "Environment", icon: Terminal },
  { id: "deployment", label: "Deployment", icon: Workflow },
  { id: "troubleshooting", label: "Troubleshooting", icon: AlertTriangle }
];

const quickLinks = [
  { title: "Agent Builder", desc: "Configure AI agents with prompts, voice, and call behavior.", href: "/agents", icon: Bot },
  { title: "Campaigns", desc: "Launch reusable outreach campaigns with student lists.", href: "/campaigns", icon: PhoneForwarded },
  { title: "Call History", desc: "Review transcripts, summaries, and call outcomes.", href: "/calls", icon: Gauge },
  { title: "Settings", desc: "Manage provider credentials and workspace config.", href: "/settings/providers", icon: Settings2 },
  { title: "Phone Numbers", desc: "Add and manage outbound caller IDs.", href: "/numbers", icon: Hash },
  { title: "Batches", desc: "One-off CSV-driven bulk screening runs.", href: "/batches", icon: Zap }
];

const providers = [
  { name: "Plivo", type: "Telephony", desc: "Outbound dialing, bidirectional media streams, status webhooks, and recording." },
  { name: "Exotel", type: "Telephony (Alt)", desc: "Alternative telephony provider for India outbound calling." },
  { name: "Cartesia", type: "STT + TTS", desc: "Default audio provider. Ink-Whisper for real-time STT, Sonic-2 for TTS.", primary: true },
  { name: "OpenAI", type: "LLM", desc: "Conversation AI via gpt-4o-mini. Handles turn generation, summaries, and data extraction.", primary: true },
  { name: "Deepgram", type: "STT (Alt)", desc: "Alternative speech-to-text with Nova-3 model." },
  { name: "ElevenLabs", type: "TTS (Alt)", desc: "Alternative text-to-speech with configurable voice models." },
  { name: "MongoDB", type: "Database", desc: "Stores all application data via Prisma ORM." },
  { name: "Redis + Bull", type: "Queue", desc: "Job scheduling, retries, and concurrent call processing." },
  { name: "AWS S3", type: "Storage", desc: "Call recording uploads and file storage." }
];

const callSteps = [
  { step: "1", title: "Queue", desc: "Call record created with UUID, job added to Bull queue" },
  { step: "2", title: "Dial", desc: "Plivo API dials the phone number, answer webhook configured" },
  { step: "3", title: "Connect", desc: "On pickup, Plivo opens bidirectional WebSocket media stream" },
  { step: "4", title: "Listen", desc: "Mulaw 8kHz audio converted to PCM 16kHz, streamed to Cartesia STT" },
  { step: "5", title: "Think", desc: "Transcript sent to OpenAI with system prompt and conversation history" },
  { step: "6", title: "Speak", desc: "AI response synthesized by Cartesia TTS as mulaw audio" },
  { step: "7", title: "Play", desc: "Audio sent back through Plivo WebSocket to the caller's phone" },
  { step: "8", title: "End", desc: "Call finalized with transcript, summary, and extracted data saved" }
];

const agentTabs = [
  { tab: "Agent", desc: "Welcome message and system prompt that controls the AI personality" },
  { tab: "LLM", desc: "OpenAI model selection, temperature, and token limits" },
  { tab: "Audio", desc: "STT/TTS provider, model, voice ID, speed, and buffer settings" },
  { tab: "Engine", desc: "Interruption handling, endpointing sensitivity, latency controls" },
  { tab: "Call", desc: "Telephony provider, silence timeout, call timeout, voicemail detection" },
  { tab: "Analytics", desc: "Post-call summarization, data extraction prompts, webhooks" },
  { tab: "Inbound", desc: "Assign phone numbers for incoming call routing" }
];

const entities = [
  { name: "Organization", desc: "Multi-tenant workspace boundary. Owns all other entities." },
  { name: "User", desc: "Authenticated team member with role-based access (admin, manager, recruiter, viewer)." },
  { name: "Agent", desc: "AI conversational blueprint with 40+ configuration fields across 7 tabs." },
  { name: "PhoneNumber", desc: "Verified outbound caller ID tied to a telephony provider." },
  { name: "Campaign", desc: "Reusable outreach container with students, retry rules, and call windows." },
  { name: "Student", desc: "Contact record within a campaign with status tracking and retry count." },
  { name: "Batch", desc: "One-off CSV upload for quick bulk calling without campaign overhead." },
  { name: "Call", desc: "Individual call attempt with UUID, status, duration, recording, transcript, and summary." },
  { name: "CallTurn", desc: "Single message in a conversation (user or assistant) with sequence ordering." }
];

const roles = [
  { role: "Admin", access: "Full access", desc: "Provider setup, user management, agents, campaigns, settings, and all platform controls." },
  { role: "Manager", access: "Operational", desc: "Agent configuration, campaign management, call monitoring, and batch operations." },
  { role: "Recruiter", access: "Execution", desc: "Launch campaigns and batches, review call outcomes and transcripts." },
  { role: "Viewer", access: "Read-only", desc: "Dashboard metrics, call history, and reporting without write access." }
];

const envGroups = [
  { title: "Core", vars: ["PORT", "SERVER_URL", "APP_URL", "VITE_API_URL", "JWT_SECRET"] },
  { title: "Database", vars: ["DATABASE_URL", "REDIS_URL"] },
  { title: "Telephony", vars: ["PLIVO_AUTH_ID", "PLIVO_AUTH_TOKEN", "PLIVO_DEFAULT_NUMBER"] },
  { title: "AI (Required)", vars: ["OPENAI_API_KEY", "OPENAI_MODEL", "CARTESIA_API_KEY", "CARTESIA_DEFAULT_VOICE_ID", "CARTESIA_STT_MODEL", "CARTESIA_TTS_MODEL"] },
  { title: "AI (Optional)", vars: ["DEEPGRAM_API_KEY", "ELEVENLABS_API_KEY", "ELEVENLABS_DEFAULT_VOICE_ID"] },
  { title: "Storage", vars: ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_REGION", "AWS_BUCKET_NAME"] }
];

const troubleshooting = [
  { q: "Login/register fails", a: "Check backend is running, VITE_API_URL matches server port, JWT_SECRET is set." },
  { q: "Calls never start", a: "Verify Plivo credentials, outbound number exists, Redis is running for Bull queue." },
  { q: "Call connects but no voice", a: "Check CARTESIA_API_KEY, CARTESIA_DEFAULT_VOICE_ID, and that ngrok is forwarding WSS correctly." },
  { q: "STT not working", a: "Confirm Cartesia STT WebSocket connects (check logs for '[CartesiaStt] WebSocket connected')." },
  { q: "Call drops immediately", a: "Ensure keepCallAlive='true' in Plivo XML. Check SERVER_URL points to ngrok URL." },
  { q: "No transcripts saved", a: "Verify Cartesia STT is receiving audio. Check for errors in MediaBridge logs." },
  { q: "MongoDB not syncing", a: "Run 'npx prisma db push --schema apps/server/prisma/schema.prisma' and check DATABASE_URL." }
];

// ─── Component ───────────────────────────────────────────────────────────────

export default function DocumentationPage() {
  const [activeSection, setActiveSection] = useState("getting-started");

  function scrollTo(id: string) {
    setActiveSection(id);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

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
          {sections.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={`doc__nav-item ${activeSection === id ? "doc__nav-item--active" : ""}`}
              onClick={() => scrollTo(id)}
            >
              <Icon size={15} />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <div className="doc__nav-footer">
          <Link to="/dashboard" className="doc__nav-item">
            <ArrowRight size={15} />
            <span>Back to Dashboard</span>
          </Link>
        </div>
      </aside>

      {/* Main content */}
      <main className="doc__main">
        <div className="doc__content">

          {/* Header */}
          <div className="doc__header">
            <div className="doc__badge">Documentation</div>
            <h1>Voice Screening Platform</h1>
            <p>Complete reference for setup, configuration, and operation of the NxtWave AI screening platform.</p>
          </div>

          {/* Getting Started */}
          <section id="getting-started" className="doc__section">
            <h2><Rocket size={20} /> Getting Started</h2>
            <p>Quick links to the main areas of the platform.</p>

            <div className="doc__grid doc__grid--3">
              {quickLinks.map(({ title, desc, href, icon: Icon }) => (
                <Link key={title} to={href} className="doc__card doc__card--link">
                  <div className="doc__card-icon"><Icon size={18} /></div>
                  <strong>{title}</strong>
                  <p>{desc}</p>
                  <ChevronRight size={14} className="doc__card-arrow" />
                </Link>
              ))}
            </div>

            <div className="doc__callout">
              <strong>Quick Setup</strong>
              <pre><code>{`# 1. Start Redis\ndocker compose up -d\n\n# 2. Push database schema\nnpx prisma db push --schema apps/server/prisma/schema.prisma\n\n# 3. Start development servers\nnpm run dev\n\n# 4. Open in browser\nhttp://localhost:5173`}</code></pre>
            </div>
          </section>

          {/* Overview */}
          <section id="overview" className="doc__section">
            <h2><BookOpen size={20} /> Platform Overview</h2>
            <p>A self-hosted voice AI platform that enables teams to create screening agents, launch outbound campaigns, conduct real-time AI phone conversations, and review results with transcripts and analytics.</p>

            <div className="doc__grid doc__grid--2">
              <Card className="doc__feature-card">
                <h3>Setup Surfaces</h3>
                <ul>
                  <li><strong>Agent Builder</strong> — 7-tab configuration for AI conversation behavior</li>
                  <li><strong>Settings</strong> — Provider credentials, AI services, storage, team</li>
                  <li><strong>Phone Numbers</strong> — Outbound caller ID management</li>
                </ul>
              </Card>
              <Card className="doc__feature-card">
                <h3>Execution Surfaces</h3>
                <ul>
                  <li><strong>Campaigns</strong> — Reusable outreach with student lists and retries</li>
                  <li><strong>Batches</strong> — One-off CSV bulk screening runs</li>
                  <li><strong>Call History</strong> — Transcripts, summaries, and outcomes</li>
                </ul>
              </Card>
            </div>
          </section>

          {/* Architecture */}
          <section id="architecture" className="doc__section">
            <h2><Server size={20} /> Architecture</h2>
            <p>Four-layer architecture with a React frontend, Express API, real-time WebSocket media bridge, and external AI/telephony services.</p>

            <div className="doc__arch">
              <div className="doc__arch-node doc__arch-node--blue">
                <Network size={20} />
                <strong>Frontend</strong>
                <span>React + Vite + TypeScript + Tailwind</span>
              </div>
              <div className="doc__arch-arrow">
                <ArrowRight size={16} />
              </div>
              <div className="doc__arch-node doc__arch-node--green">
                <Workflow size={20} />
                <strong>API + Queue</strong>
                <span>Express + Bull + Redis</span>
              </div>
              <div className="doc__arch-arrow">
                <ArrowRight size={16} />
              </div>
              <div className="doc__arch-node doc__arch-node--amber">
                <Mic size={20} />
                <strong>Media Bridge</strong>
                <span>WebSocket + STT + LLM + TTS</span>
              </div>
              <div className="doc__arch-arrow">
                <ArrowRight size={16} />
              </div>
              <div className="doc__arch-node doc__arch-node--slate">
                <Database size={20} />
                <strong>Data + Storage</strong>
                <span>MongoDB + Redis + S3</span>
              </div>
            </div>
          </section>

          {/* Call Flow */}
          <section id="call-flow" className="doc__section">
            <h2><Phone size={20} /> Real-Time Call Flow</h2>
            <p>What happens from the moment you click "Get call from agent" to when the call ends.</p>

            <div className="doc__timeline">
              {callSteps.map(({ step, title, desc }) => (
                <div key={step} className="doc__timeline-step">
                  <div className="doc__timeline-num">{step}</div>
                  <div className="doc__timeline-body">
                    <strong>{title}</strong>
                    <p>{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Agent Builder */}
          <section id="agents" className="doc__section">
            <h2><Bot size={20} /> Agent Builder</h2>
            <p>The flagship screen. Configure every aspect of how the AI conducts screening calls.</p>

            <div className="doc__grid doc__grid--1">
              {agentTabs.map(({ tab, desc }) => (
                <div key={tab} className="doc__tab-row">
                  <div className="doc__tab-name">{tab}</div>
                  <div className="doc__tab-desc">{desc}</div>
                </div>
              ))}
            </div>
          </section>

          {/* Operations */}
          <section id="operations" className="doc__section">
            <h2><PhoneForwarded size={20} /> Campaigns & Batches</h2>
            <div className="doc__grid doc__grid--2">
              <Card className="doc__feature-card">
                <h3>Campaigns</h3>
                <p>Reusable outreach containers tied to an agent, phone number, and retry policy. Upload student CSV, start the campaign, and the queue processes all calls.</p>
                <ul>
                  <li>Configurable retry delays (busy: 15min, no-answer: 30min)</li>
                  <li>Call window scheduling (e.g., 9AM-9PM IST)</li>
                  <li>Pause/resume control</li>
                  <li>Per-student status tracking</li>
                </ul>
              </Card>
              <Card className="doc__feature-card">
                <h3>Batches</h3>
                <p>One-off CSV uploads for quick bulk screening. Create a batch, upload contacts, and launch immediately.</p>
                <ul>
                  <li>No long-lived state — upload and run</li>
                  <li>Same call queue and worker as campaigns</li>
                  <li>Progress tracking (total, processed, success, failed)</li>
                  <li>Best for event-driven or temporary outreach</li>
                </ul>
              </Card>
            </div>
          </section>

          {/* Providers */}
          <section id="providers" className="doc__section">
            <h2><Network size={20} /> Providers</h2>
            <p>Each provider has one responsibility in the pipeline.</p>

            <div className="doc__grid doc__grid--3">
              {providers.map(({ name, type, desc, primary }) => (
                <div key={name} className={`doc__provider ${primary ? "doc__provider--primary" : ""}`}>
                  <div className="doc__provider-header">
                    <strong>{name}</strong>
                    <span className="doc__provider-type">{type}</span>
                  </div>
                  <p>{desc}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Data Model */}
          <section id="data-model" className="doc__section">
            <h2><Database size={20} /> Data Model</h2>
            <p>Core MongoDB collections managed via Prisma ORM. Every entity uses UUIDs.</p>

            <div className="doc__table">
              <div className="doc__table-head">
                <span>Entity</span>
                <span>Description</span>
              </div>
              {entities.map(({ name, desc }) => (
                <div key={name} className="doc__table-row">
                  <span className="doc__table-entity"><Code size={13} /> {name}</span>
                  <span>{desc}</span>
                </div>
              ))}
            </div>
          </section>

          {/* Roles */}
          <section id="roles" className="doc__section">
            <h2><Users size={20} /> Roles & Access</h2>
            <p>Role-based access control with four levels. Assigned at registration or by admin.</p>

            <div className="doc__grid doc__grid--2">
              {roles.map(({ role, access, desc }) => (
                <div key={role} className="doc__role-card">
                  <div className="doc__role-header">
                    <strong>{role}</strong>
                    <span className="doc__role-badge">{access}</span>
                  </div>
                  <p>{desc}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Environment */}
          <section id="environment" className="doc__section">
            <h2><Terminal size={20} /> Environment</h2>
            <p>All configuration via root <code>.env</code> file. Required variables grouped by service.</p>

            <div className="doc__grid doc__grid--3">
              {envGroups.map(({ title, vars }) => (
                <div key={title} className="doc__env-group">
                  <strong>{title}</strong>
                  <div className="doc__env-list">
                    {vars.map((v) => (
                      <code key={v}>{v}</code>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="doc__callout">
              <strong>Local Development</strong>
              <pre><code>{`# Start Redis\ndocker compose up -d\n\n# Push schema\nnpx prisma db push --schema apps/server/prisma/schema.prisma\n\n# Generate Prisma client\nnpx prisma generate --schema apps/server/prisma/schema.prisma\n\n# Start dev servers (frontend :5173 + backend :3001)\nnpm run dev\n\n# For live calls: start ngrok and update SERVER_URL\nngrok http 3001`}</code></pre>
            </div>
          </section>

          {/* Deployment */}
          <section id="deployment" className="doc__section">
            <h2><Workflow size={20} /> Deployment</h2>
            <p>Split frontend/backend deployment with managed infrastructure services.</p>

            <div className="doc__grid doc__grid--2">
              <Card className="doc__feature-card">
                <h3>Frontend</h3>
                <p>Deploy React + Vite as a static site. Only needs <code>VITE_API_URL</code> pointing to the backend.</p>
              </Card>
              <Card className="doc__feature-card">
                <h3>Backend + Media Bridge</h3>
                <p>Always-on Express server with public HTTPS and WSS support. Receives webhooks and media streams.</p>
              </Card>
              <Card className="doc__feature-card">
                <h3>Database + Queue</h3>
                <p>MongoDB Atlas for data, Redis for Bull queues. Use managed services in production.</p>
              </Card>
              <Card className="doc__feature-card">
                <h3>Storage + Secrets</h3>
                <p>S3 for recordings. All credentials via environment variables, never hardcoded.</p>
              </Card>
            </div>
          </section>

          {/* Troubleshooting */}
          <section id="troubleshooting" className="doc__section">
            <h2><AlertTriangle size={20} /> Troubleshooting</h2>
            <p>Common issues and how to resolve them.</p>

            <div className="doc__faq">
              {troubleshooting.map(({ q, a }) => (
                <div key={q} className="doc__faq-item">
                  <div className="doc__faq-q"><AlertTriangle size={14} /> {q}</div>
                  <div className="doc__faq-a"><CheckCircle size={14} /> {a}</div>
                </div>
              ))}
            </div>
          </section>

        </div>
      </main>
    </div>
  );
}
