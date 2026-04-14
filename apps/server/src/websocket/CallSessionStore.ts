export interface SessionRecord {
  callId: string;
  streamSid: string;
  agentId: string;
  history: string[];
  turnCount: number;
  startedAt: Date;
}

export class CallSessionStore {
  private readonly sessions = new Map<string, SessionRecord>();

  get(callId: string): SessionRecord | undefined {
    return this.sessions.get(callId);
  }

  create(callId: string, agentId = ""): SessionRecord {
    const session: SessionRecord = {
      callId,
      streamSid: "",
      agentId,
      history: [],
      turnCount: 0,
      startedAt: new Date()
    };
    this.sessions.set(callId, session);
    return session;
  }

  setStreamSid(callId: string, streamSid: string): void {
    const session = this.sessions.get(callId);
    if (session) session.streamSid = streamSid;
  }

  append(callId: string, line: string): void {
    const session = this.sessions.get(callId) ?? this.create(callId);
    session.history.push(line);
    session.turnCount++;
  }

  remove(callId: string): void {
    this.sessions.delete(callId);
  }

  list(): string[] {
    return Array.from(this.sessions.keys());
  }
}
