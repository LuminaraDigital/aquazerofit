/**
 * Aqua Coach — pixel reference: coach_ai_assistant.
 * Most-recent session bootstrap (GET/POST /chat/sessions), streaming replies
 * via streamChat() with a typing indicator, tool-result GlassCards, suggested
 * prompt chips, persistent wellness disclaimer, supportive safety frames
 * (never alarm-styled), report flow, and a minimal safe markdown renderer
 * (bold + bullets — no dangerouslySetInnerHTML).
 */
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ChatMessage, ChatSession, ChatToolCall } from '@aquazerofit/shared';
import { WELLNESS_DISCLAIMER } from '@aquazerofit/shared';
import { api, ApiError, streamChat } from '@/lib/api';
import { AppHeader } from '@/components/ui/AppHeader';
import { GlassCard } from '@/components/ui/GlassCard';
import { Chip } from '@/components/ui/Chip';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { SecondaryButton } from '@/components/ui/SecondaryButton';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { useToast } from '@/components/ui/Toast';
import { BottomSheet } from '@/pages/training/BottomSheet';

const SUGGESTED_PROMPTS = [
  'What should I eat tonight?',
  'How is my weight trending?',
  "Adjust today's workout",
  'How much protein do I need?',
];

const TOOL_LABELS: Record<string, string> = {
  getTodayNutrition: "Today's nutrition",
  getTodayWorkout: "Today's workout",
  getCurrentPlan: 'Current plan',
  getProgressSummary: 'Progress summary',
};

/** Fallback for unmapped tool names: getFooBar → "Foo bar". */
function humaniseTool(tool: string): string {
  const words = tool
    .replace(/^get/, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

// ---------- minimal safe markdown (bold + bullet lists) ----------

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <strong key={`${keyPrefix}-b${i}`} className="font-bold">
        {part}
      </strong>
    ) : (
      <Fragment key={`${keyPrefix}-t${i}`}>{part}</Fragment>
    ),
  );
}

export function renderMarkdown(text: string): ReactNode {
  const lines = text.split(/\r?\n/);
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  let para: string[] = [];

  const flushList = (key: string) => {
    if (list.length === 0) return;
    blocks.push(
      <ul key={key} className="my-1 list-disc space-y-1 pl-5">
        {list.map((item, i) => (
          <li key={i}>{renderInline(item, `${key}-${i}`)}</li>
        ))}
      </ul>,
    );
    list = [];
  };
  const flushPara = (key: string) => {
    if (para.length === 0) return;
    blocks.push(<p key={key}>{renderInline(para.join(' '), key)}</p>);
    para = [];
  };

  lines.forEach((raw, idx) => {
    const line = raw.trim();
    const bullet = /^[-*•]\s+(.*)$/.exec(line);
    if (bullet) {
      flushPara(`p${idx}`);
      list.push(bullet[1]);
    } else if (line === '') {
      flushPara(`p${idx}`);
      flushList(`l${idx}`);
    } else {
      flushList(`l${idx}`);
      para.push(line);
    }
  });
  flushPara('p-end');
  flushList('l-end');
  return <div className="space-y-2">{blocks}</div>;
}

// ---------- local display model ----------

interface SystemFrame {
  id: string;
  kind: 'system';
  text: string;
}

function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

/** Accept bare arrays and the API's { items } / { sessions } / { messages } envelopes. */
function asList<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === 'object') {
    const record = data as Record<string, unknown>;
    for (const key of ['items', 'sessions', 'messages']) {
      if (Array.isArray(record[key])) return record[key] as T[];
    }
  }
  return [];
}

function CoachAvatar() {
  return (
    <div className="flex items-center gap-2">
      <div
        aria-hidden="true"
        className="flex h-8 w-8 items-center justify-center rounded-full border border-primary/40 bg-primary/20 shadow-[0_0_10px_rgba(138,235,255,0.35)]"
      >
        <span className="material-symbols-outlined text-[18px] text-primary">smart_toy</span>
      </div>
      <span className="text-sm text-on-surface-variant">Aqua Coach</span>
    </div>
  );
}

function ToolCards({ toolCalls }: { toolCalls: ChatToolCall[] }) {
  return (
    <div className="mt-2 space-y-2">
      {toolCalls.map((tc, i) => (
        <GlassCard key={`${tc.tool}-${i}`} className="p-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-primary">
            {TOOL_LABELS[tc.tool] ?? humaniseTool(tc.tool)}
          </p>
          <p className="mt-1 text-sm text-on-surface-variant">{tc.resultSummary}</p>
        </GlassCard>
      ))}
    </div>
  );
}

export default function Coach() {
  const queryClient = useQueryClient();
  const toast = useToast();

  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState('');
  const [pendingUser, setPendingUser] = useState<string | null>(null);
  const [frames, setFrames] = useState<SystemFrame[]>([]);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [clearOpen, setClearOpen] = useState(false);
  const [liveNote, setLiveNote] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const creatingRef = useRef(false);

  // ---- session bootstrap ----
  const sessionsQuery = useQuery({
    queryKey: ['chat', 'sessions'],
    queryFn: async () => asList<ChatSession>(await api<unknown>('/chat/sessions')),
  });

  const createSession = useMutation({
    mutationFn: () => api<ChatSession>('/chat/sessions', { method: 'POST', body: {} }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['chat', 'sessions'] }),
  });

  const session = useMemo(() => {
    const list = [...(sessionsQuery.data ?? [])];
    list.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
    return list[0] ?? null;
  }, [sessionsQuery.data]);

  useEffect(() => {
    if (sessionsQuery.isSuccess && !session && !creatingRef.current) {
      creatingRef.current = true;
      createSession.mutate();
    }
  }, [sessionsQuery.isSuccess, session, createSession]);

  const sessionId = session?.id ?? '';

  // ---- messages ----
  const messagesQuery = useQuery({
    queryKey: ['chat', 'messages', sessionId],
    queryFn: async () =>
      asList<ChatMessage>(await api<unknown>(`/chat/sessions/${sessionId}/messages`)),
    enabled: sessionId !== '',
  });
  const messages = useMemo(() => messagesQuery.data ?? [], [messagesQuery.data]);

  // ---- scroll to latest ----
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, streamText, pendingUser, frames.length]);

  // ---- send / stream ----
  const send = useCallback(
    async (content: string) => {
      const text = content.trim();
      if (!text || streaming || !sessionId) return;
      setInput('');
      setPendingUser(text);
      setStreaming(true);
      setStreamText('');
      setLiveNote('Aqua Coach is replying');
      try {
        await streamChat(sessionId, text, (token) => {
          setStreamText((s) => s + token);
        });
        setLiveNote('Aqua Coach has replied');
        await queryClient.invalidateQueries({ queryKey: ['chat', 'messages', sessionId] });
        void queryClient.invalidateQueries({ queryKey: ['chat', 'sessions'] });
      } catch (e) {
        const message =
          e instanceof ApiError
            ? e.body.message
            : 'The coach is unavailable right now. Please try again in a moment.';
        // Safety blocks are persisted server-side as supportive assistant
        // messages, so the refetch below already surfaces them — adding a
        // frame too would show the refusal twice.
        const persistedByServer =
          e instanceof ApiError && (e.code === 'SAFETY_INPUT' || e.code === 'SAFETY_OUTPUT');
        if (!persistedByServer) {
          setFrames((f) => [...f, { id: crypto.randomUUID(), kind: 'system', text: message }]);
        }
        setLiveNote(message);
        // keep the user's message visible even though the reply was blocked
        await queryClient.invalidateQueries({ queryKey: ['chat', 'messages', sessionId] });
      } finally {
        setStreaming(false);
        setStreamText('');
        setPendingUser(null);
      }
    },
    [sessionId, streaming, queryClient],
  );

  // ---- clear conversation ----
  const clearConversation = useMutation({
    mutationFn: () => api<void>(`/chat/sessions/${sessionId}`, { method: 'DELETE' }),
    onSuccess: async () => {
      setClearOpen(false);
      setFrames([]);
      setMenuFor(null);
      queryClient.removeQueries({ queryKey: ['chat', 'messages'] });
      queryClient.setQueryData(['chat', 'sessions'], []);
      // reuse the bootstrap path to open a fresh session immediately
      creatingRef.current = true;
      try {
        await createSession.mutateAsync();
      } catch {
        // the bootstrap effect retries once the sessions query settles
        creatingRef.current = false;
      }
      toast.success('Conversation cleared');
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : 'Could not clear the conversation'),
  });

  // ---- report ----
  const report = useMutation({
    mutationFn: (messageId: string) =>
      api<void>(`/chat/messages/${messageId}/report`, { method: 'POST' }),
    onSuccess: () => {
      setMenuFor(null);
      toast.success('Thanks — this response has been reported for review.');
      void queryClient.invalidateQueries({ queryKey: ['chat', 'messages', sessionId] });
    },
    onError: () => toast.error('Could not report the message. Please try again.'),
  });

  const showEmpty =
    !messagesQuery.isPending &&
    !messagesQuery.isError &&
    messages.length === 0 &&
    !pendingUser &&
    frames.length === 0;

  return (
    <div className="flex min-h-screen w-full flex-col">
      <AppHeader
        title="Aqua Coach"
        right={
          <div className="flex items-center gap-1">
            <Link
              to="/settings/memory"
              aria-label="What your coach remembers"
              className="flex h-10 w-10 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                psychology
              </span>
            </Link>
            <button
              type="button"
              aria-label="Clear conversation"
              disabled={sessionId === '' || streaming}
              onClick={() => setClearOpen(true)}
              className="flex h-10 w-10 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-40"
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                delete_sweep
              </span>
            </button>
          </div>
        }
      />

      {/* persistent wellness disclaimer (AQF-11) — sits below the sticky header,
          not competing with it for the same top-0 slot */}
      <div className="sticky top-[65px] z-30 bg-surface/90 px-container-margin py-2 backdrop-blur-md">
        <div className="flex items-center gap-3 rounded-card border border-outline-variant bg-surface-container-low/60 p-3">
          <span className="material-symbols-outlined text-[20px] text-tertiary-container" aria-hidden="true">
            info
          </span>
          <p className="text-xs text-on-surface-variant">{WELLNESS_DISCLAIMER}</p>
        </div>
      </div>

      {/* polite live region for streaming + safety frames */}
      <div aria-live="polite" className="sr-only">
        {liveNote}
      </div>

      {/* ---- message list ---- */}
      <main className="flex flex-1 flex-col gap-5 px-container-margin py-5" aria-label="Conversation with Aqua Coach">
        {sessionsQuery.isPending || (sessionId !== '' && messagesQuery.isPending) ? (
          <div className="space-y-4">
            <Skeleton className="h-20 w-3/4 rounded-card" />
            <Skeleton className="ml-auto h-14 w-2/3 rounded-card" />
            <Skeleton className="h-24 w-3/4 rounded-card" />
          </div>
        ) : sessionsQuery.isError ? (
          <ErrorState
            message="Could not open the coach."
            retry={() => void sessionsQuery.refetch()}
          />
        ) : messagesQuery.isError ? (
          <ErrorState
            message="Could not load your conversation."
            retry={() => void messagesQuery.refetch()}
          />
        ) : (
          <>
            {showEmpty && (
              <div className="mt-4 flex flex-col items-center gap-4 text-center">
                <div
                  aria-hidden="true"
                  className="flex h-16 w-16 items-center justify-center rounded-full border border-primary/40 bg-primary/15 shadow-[0_0_20px_rgba(138,235,255,0.35)]"
                >
                  <span className="material-symbols-outlined text-3xl text-primary">smart_toy</span>
                </div>
                <div>
                  <h2 className="heading-display font-heading text-2xl text-on-surface">
                    Hi, I'm Aqua Coach
                  </h2>
                  <p className="mt-1 text-sm text-on-surface-variant">
                    Ask me about your nutrition, training or progress.
                  </p>
                </div>
                <div className="flex flex-wrap justify-center gap-2">
                  {SUGGESTED_PROMPTS.map((p) => (
                    <Chip key={p} label={p} tone="aqua" onClick={() => void send(p)} />
                  ))}
                </div>
              </div>
            )}

            {messages.map((m) =>
              m.role === 'user' ? (
                <div key={m.id} className="flex max-w-[85%] flex-col gap-1 self-end">
                  <div className="cta-gradient rounded-card rounded-br-md p-4 text-on-primary shadow-lg">
                    <p className="text-base leading-relaxed">{m.content}</p>
                  </div>
                  <span className="self-end px-2 text-xs text-on-surface-variant tabular-nums">
                    {timeOf(m.createdAt)}
                  </span>
                </div>
              ) : (
                <div key={m.id} className="flex max-w-[90%] flex-col gap-2 self-start">
                  <div className="flex items-center justify-between">
                    <CoachAvatar />
                    <div className="relative">
                      <button
                        aria-label="Message options"
                        aria-haspopup="menu"
                        aria-expanded={menuFor === m.id}
                        onClick={() => setMenuFor(menuFor === m.id ? null : m.id)}
                        className="flex h-8 w-8 items-center justify-center rounded-full text-on-surface-variant hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                      >
                        <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
                          more_vert
                        </span>
                      </button>
                      {menuFor === m.id && (
                        <div
                          role="menu"
                          className="absolute right-0 top-9 z-20 w-44 rounded-card border border-outline-variant bg-surface-container-high p-1 shadow-xl"
                        >
                          <button
                            role="menuitem"
                            disabled={report.isPending}
                            onClick={() => report.mutate(m.id)}
                            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-on-surface hover:bg-surface-container-highest focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                          >
                            <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
                              flag
                            </span>
                            Report response
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                  <div
                    className={
                      m.guardrail?.blocked
                        ? 'rounded-card rounded-bl-md border border-secondary/40 bg-secondary/10 p-4 text-base leading-relaxed text-on-surface'
                        : 'glass-card rounded-bl-md p-4 text-base leading-relaxed text-on-surface'
                    }
                  >
                    {m.guardrail?.blocked && (
                      <span
                        aria-hidden="true"
                        className="material-symbols-outlined mb-1 block text-[20px] text-secondary"
                      >
                        spa
                      </span>
                    )}
                    {renderMarkdown(m.content)}
                    {m.toolCalls && m.toolCalls.length > 0 && <ToolCards toolCalls={m.toolCalls} />}
                  </div>
                  <span className="px-2 text-xs text-on-surface-variant tabular-nums">
                    {timeOf(m.createdAt)}
                  </span>
                </div>
              ),
            )}

            {/* optimistic user bubble while streaming */}
            {pendingUser && (
              <div className="flex max-w-[85%] flex-col gap-1 self-end">
                <div className="cta-gradient rounded-card rounded-br-md p-4 text-on-primary shadow-lg">
                  <p className="text-base leading-relaxed">{pendingUser}</p>
                </div>
              </div>
            )}

            {/* streaming assistant bubble / typing indicator */}
            {streaming && (
              <div className="flex max-w-[90%] flex-col gap-2 self-start">
                <CoachAvatar />
                <div className="glass-card rounded-bl-md p-4 text-base leading-relaxed text-on-surface">
                  {streamText ? (
                    renderMarkdown(streamText)
                  ) : (
                    <span className="flex items-center gap-1.5" aria-label="Aqua Coach is typing">
                      {[0, 1, 2].map((i) => (
                        <span
                          key={i}
                          aria-hidden="true"
                          className="h-2 w-2 animate-pulse rounded-full bg-primary/70"
                          style={{ animationDelay: `${i * 200}ms` }}
                        />
                      ))}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* supportive system frames (safety / availability) — calm styling */}
            {frames.map((f) => (
              <div key={f.id} className="flex max-w-[90%] flex-col gap-2 self-start">
                <CoachAvatar />
                <div className="rounded-card rounded-bl-md border border-secondary/30 bg-secondary/10 p-4">
                  <div className="flex items-start gap-2">
                    <span
                      className="material-symbols-outlined mt-0.5 text-[20px] text-secondary"
                      aria-hidden="true"
                    >
                      spa
                    </span>
                    <p className="text-base leading-relaxed text-on-surface">{f.text}</p>
                  </div>
                </div>
              </div>
            ))}
          </>
        )}
        <div ref={endRef} />
      </main>

      {/* ---- clear conversation confirm sheet ---- */}
      <BottomSheet
        open={clearOpen}
        onClose={() => setClearOpen(false)}
        title="Clear Conversation"
      >
        <div className="space-y-5">
          <p className="text-base text-on-surface">
            Delete this conversation and start fresh? This cannot be undone.
          </p>
          <div className="flex flex-col gap-3">
            <PrimaryButton
              disabled={clearConversation.isPending}
              onClick={() => clearConversation.mutate()}
            >
              {clearConversation.isPending ? 'Clearing…' : 'Clear conversation'}
            </PrimaryButton>
            <SecondaryButton onClick={() => setClearOpen(false)}>Cancel</SecondaryButton>
          </div>
        </div>
      </BottomSheet>

      {/* ---- input bar — sits above the bottom nav ---- */}
      <div className="sticky bottom-0 z-30 bg-gradient-to-t from-surface via-surface to-transparent px-container-margin pb-20 pt-2">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send(input);
          }}
          className="glass-card flex items-center gap-2 rounded-card p-2 focus-within:border-primary focus-within:shadow-[0_0_15px_rgba(138,235,255,0.2)]"
        >
          <label htmlFor="coach-input" className="sr-only">
            Message Aqua Coach
          </label>
          <input
            id="coach-input"
            type="text"
            maxLength={4000}
            placeholder="Ask Aqua Coach…"
            value={input}
            disabled={streaming || sessionId === ''}
            onChange={(e) => setInput(e.target.value)}
            className="flex-1 border-none bg-transparent px-2 text-base text-on-surface placeholder-on-surface-variant/50 focus:outline-none focus:ring-0 disabled:opacity-60"
          />
          <button
            type="submit"
            aria-label="Send message"
            disabled={streaming || input.trim() === '' || sessionId === ''}
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-on-primary shadow-lg transition-transform active:scale-90 disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              {streaming ? 'hourglass_top' : 'send'}
            </span>
          </button>
        </form>
      </div>
    </div>
  );
}
