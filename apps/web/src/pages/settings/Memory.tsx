/**
 * "What your coach remembers" — the user-facing view of the coach memory
 * (GET/POST/PATCH/DELETE /me/memory*). Routed from Settings and from the
 * Aqua Coach header.
 *
 * States: consent-off (calm explainer, never an error), loading skeletons,
 * error with retry, empty, and the grouped facts list (suggested → confirmed
 * → rejected behind a disclosure). All affordances are visible buttons —
 * no hover-only controls (TMA-safe).
 */
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError } from '../../lib/api';
import { formatDate, relativeTime, toLocalDate } from '../../lib/format';
import { haptic } from '../../lib/telegram';
import {
  useAddMemoryFact,
  useClearMemory,
  useConsents,
  useDeleteMemoryFact,
  useMemory,
  useUpdateMemoryFact,
  type MemoryFact,
  type MemoryFactCategory,
} from '../../lib/queries';
import { AppHeader } from '../../components/ui/AppHeader';
import { BottomNav } from '../../components/ui/BottomNav';
import { Chip, type ChipTone } from '../../components/ui/Chip';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState } from '../../components/ui/ErrorState';
import { Input } from '../../components/ui/Input';
import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { SecondaryButton } from '../../components/ui/SecondaryButton';
import { Skeleton } from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/Toast';

const CATEGORIES: {
  value: MemoryFactCategory;
  label: string;
  helper: string;
  tone: ChipTone;
  icon: string;
}[] = [
  {
    value: 'preference',
    label: 'Preference',
    helper: 'Foods, workouts and styles you enjoy',
    tone: 'aqua',
    icon: 'favorite',
  },
  {
    value: 'constraint',
    label: 'Constraint',
    helper: 'Limits your coach should always respect',
    tone: 'coral',
    icon: 'block',
  },
  {
    value: 'goal',
    label: 'Goal',
    helper: 'What you are working toward',
    tone: 'green',
    icon: 'flag',
  },
  {
    value: 'milestone',
    label: 'Milestone',
    helper: 'Wins worth remembering',
    tone: 'navy',
    icon: 'emoji_events',
  },
  {
    value: 'context',
    label: 'Context',
    helper: 'Life details that shape your plan',
    tone: 'aqua',
    icon: 'info',
  },
];

const CATEGORY_META = Object.fromEntries(CATEGORIES.map((c) => [c.value, c])) as Record<
  MemoryFactCategory,
  (typeof CATEGORIES)[number]
>;

const SOURCE_LABELS: Record<MemoryFact['source']['kind'], string> = {
  chat: 'From your chat',
  log: 'From your logs',
  profile: 'From your profile',
  user: 'Added by you',
};

function provenance(fact: MemoryFact): string {
  const kind = fact.source?.kind;
  const label = kind ? SOURCE_LABELS[kind] : 'Remembered';
  return `${label} on ${formatDate(toLocalDate(new Date(fact.createdAt)))} · ${relativeTime(
    fact.updatedAt || fact.createdAt,
  )}`;
}

function CategoryBadge({ category }: { category: MemoryFactCategory }) {
  const meta = CATEGORY_META[category];
  return <Chip label={meta.label} tone={meta.tone} icon={meta.icon} />;
}

// ---------- fact cards ----------

function SuggestedFactCard({
  fact,
  busy,
  onDecide,
}: {
  fact: MemoryFact;
  busy: boolean;
  onDecide: (status: 'confirmed' | 'rejected') => void;
}) {
  return (
    <div className="glass-card p-4 space-y-3">
      <p className="text-base text-on-surface leading-relaxed">{fact.text}</p>
      <div className="flex flex-wrap items-center gap-2">
        <CategoryBadge category={fact.category} />
        <span className="text-xs text-on-surface-variant">{provenance(fact)}</span>
      </div>
      <div className="flex gap-3">
        <SecondaryButton
          onClick={() => onDecide('rejected')}
          disabled={busy}
          className="!min-h-[44px] !text-sm"
        >
          <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
            close
          </span>
          Not right
        </SecondaryButton>
        <PrimaryButton
          onClick={() => onDecide('confirmed')}
          disabled={busy}
          className="!min-h-[44px] !text-sm"
        >
          <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
            check
          </span>
          Keep it
        </PrimaryButton>
      </div>
    </div>
  );
}

function ConfirmedFactCard({
  fact,
  busy,
  onSaveText,
  onDelete,
}: {
  fact: MemoryFact;
  busy: boolean;
  onSaveText: (text: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(fact.text);

  if (editing) {
    return (
      <div className="glass-card p-4 space-y-3">
        <Input
          label="Memory"
          icon="edit_note"
          maxLength={280}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <div className="flex gap-3">
          <SecondaryButton
            onClick={() => {
              setDraft(fact.text);
              setEditing(false);
            }}
            disabled={busy}
            className="!min-h-[44px] !text-sm"
          >
            Cancel
          </SecondaryButton>
          <PrimaryButton
            onClick={() => {
              const text = draft.trim();
              if (!text) return;
              onSaveText(text);
              setEditing(false);
            }}
            disabled={busy || draft.trim() === ''}
            className="!min-h-[44px] !text-sm"
          >
            Save
          </PrimaryButton>
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card p-4 space-y-3">
      <p className="text-base text-on-surface leading-relaxed">{fact.text}</p>
      <div className="flex flex-wrap items-center gap-2">
        <CategoryBadge category={fact.category} />
        <span className="text-xs text-on-surface-variant">{provenance(fact)}</span>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setDraft(fact.text);
            setEditing(true);
          }}
          disabled={busy}
          className="flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium text-primary hover:bg-primary/10 transition-colors disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
        >
          <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
            edit
          </span>
          Edit
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={busy}
          className="flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium text-coral hover:bg-coral/10 transition-colors disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-coral"
        >
          <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
            delete
          </span>
          Delete
        </button>
      </div>
    </div>
  );
}

// ---------- page ----------

export default function Memory() {
  const navigate = useNavigate();
  const toast = useToast();

  const memoryQuery = useMemory();
  const { data: consents } = useConsents();
  const addFact = useAddMemoryFact();
  const updateFact = useUpdateMemoryFact();
  const deleteFact = useDeleteMemoryFact();
  const clearMemory = useClearMemory();

  const [text, setText] = useState('');
  const [category, setCategory] = useState<MemoryFactCategory>('preference');
  const [rejectedOpen, setRejectedOpen] = useState(false);
  const [confirmForget, setConfirmForget] = useState(false);

  const consentOff =
    (consents ? !consents.aiPersonalisation : false) ||
    (memoryQuery.error instanceof ApiError && memoryQuery.error.code === 'CONSENT_REQUIRED');

  const memory = memoryQuery.data ?? null;
  const facts = memory?.facts ?? [];
  const suggested = facts.filter((f) => f.status === 'suggested');
  const confirmed = facts.filter((f) => f.status === 'confirmed');
  const rejected = facts.filter((f) => f.status === 'rejected');
  const mutationBusy =
    addFact.isPending || updateFact.isPending || deleteFact.isPending || clearMemory.isPending;

  async function decide(fact: MemoryFact, status: 'confirmed' | 'rejected') {
    try {
      await updateFact.mutateAsync({ factId: fact.id, status });
      haptic('success');
      toast.success(status === 'confirmed' ? 'Memory kept.' : 'Okay — the coach will not use that.');
    } catch {
      haptic('error');
      toast.error('Could not update that memory. Please try again.');
    }
  }

  async function saveText(fact: MemoryFact, newText: string) {
    try {
      await updateFact.mutateAsync({ factId: fact.id, text: newText });
      haptic('success');
      toast.success('Memory updated.');
    } catch {
      haptic('error');
      toast.error('Could not update that memory. Please try again.');
    }
  }

  async function remove(fact: MemoryFact) {
    try {
      await deleteFact.mutateAsync(fact.id);
      haptic('success');
      toast.success('Memory deleted.');
    } catch {
      haptic('error');
      toast.error('Could not delete that memory. Please try again.');
    }
  }

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    try {
      await addFact.mutateAsync({ text: trimmed, category });
      haptic('success');
      toast.success('Memory added.');
      setText('');
    } catch (err) {
      haptic('error');
      if (err instanceof ApiError && err.code === 'CONSENT_REQUIRED') {
        toast.error('AI personalisation is switched off — enable it in Settings first.');
      } else {
        toast.error('Could not save that memory. Please try again.');
      }
    }
  }

  async function onForgetEverything() {
    try {
      await clearMemory.mutateAsync();
      haptic('success');
      setConfirmForget(false);
      toast.success('All memories cleared.');
    } catch {
      haptic('error');
      setConfirmForget(false);
      toast.error('Could not clear your memories. Please try again.');
    }
  }

  // ---- consent-off: calm explainer instead of an error ----
  if (consentOff) {
    return (
      <div className="max-w-md mx-auto min-h-screen relative safe-bottom">
        <AppHeader back title="Coach Memory" />
        <main className="pt-6 px-container-margin">
          <div className="glass-card p-8 flex flex-col items-center text-center gap-4">
            <span
              className="w-14 h-14 rounded-full bg-secondary/15 flex items-center justify-center"
              aria-hidden="true"
            >
              <span className="material-symbols-outlined text-3xl text-secondary">spa</span>
            </span>
            <h2 className="font-heading font-semibold uppercase tracking-wide text-lg text-on-surface">
              Memory is paused
            </h2>
            <p className="text-sm text-on-surface-variant max-w-xs leading-relaxed">
              Coach memory needs the AI personalisation consent, which is currently switched off.
              Nothing new is remembered while it is off — you decide if and when to turn it back
              on.
            </p>
            <SecondaryButton
              onClick={() => navigate('/settings')}
              className="mt-1 max-w-[260px] min-h-[48px]"
            >
              Review consent settings
            </SecondaryButton>
          </div>
        </main>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto min-h-screen relative safe-bottom">
      <AppHeader back title="Coach Memory" />

      <main className="pt-6 px-container-margin space-y-section-gap pb-6">
        {/* Trust framing */}
        <section className="space-y-1 px-2">
          <h2 className="font-heading font-semibold uppercase tracking-wide text-xl text-primary">
            What your coach remembers
          </h2>
          <p className="text-sm text-on-surface-variant leading-relaxed">
            Memories help Aqua Coach personalise your guidance — and you are always in control:
            review, edit or delete anything here.
          </p>
        </section>

        {memoryQuery.isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-24 w-full rounded-card" />
            <Skeleton className="h-20 w-full rounded-card" />
            <Skeleton className="h-20 w-3/4 rounded-card" />
          </div>
        ) : memoryQuery.isError ? (
          <ErrorState
            message="We could not load your coach memory."
            retry={() => void memoryQuery.refetch()}
          />
        ) : (
          <>
            {/* Rolling summary */}
            {memory && memory.summary.trim() !== '' && (
              <section>
                <h3 className="font-heading font-semibold uppercase tracking-wide text-base text-on-surface-variant mb-2 px-2">
                  Summary
                </h3>
                <div className="glass-card p-card-padding border-l-4 border-l-primary">
                  <p className="text-sm text-on-surface-variant leading-relaxed">{memory.summary}</p>
                  <p className="mt-2 text-xs text-on-surface-variant/60">
                    Updated {relativeTime(memory.updatedAt)}
                  </p>
                </div>
              </section>
            )}

            {facts.length === 0 && (
              <EmptyState
                icon="psychology"
                title="Nothing remembered yet"
                body="As you chat and log, Aqua Coach will suggest memories here for you to review — or add one yourself below."
              />
            )}

            {/* Suggested — needs review */}
            {suggested.length > 0 && (
              <section>
                <h3 className="font-heading font-semibold uppercase tracking-wide text-base text-secondary mb-2 px-2">
                  Needs your review ({suggested.length})
                </h3>
                <p className="text-xs text-on-surface-variant mb-3 px-2">
                  Your coach noticed these — keep the ones that are right.
                </p>
                <div className="space-y-3">
                  {suggested.map((fact) => (
                    <SuggestedFactCard
                      key={fact.id}
                      fact={fact}
                      busy={updateFact.isPending}
                      onDecide={(status) => void decide(fact, status)}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Confirmed */}
            {confirmed.length > 0 && (
              <section>
                <h3 className="font-heading font-semibold uppercase tracking-wide text-base text-on-surface-variant mb-3 px-2">
                  Remembered ({confirmed.length})
                </h3>
                <div className="space-y-3">
                  {confirmed.map((fact) => (
                    <ConfirmedFactCard
                      key={fact.id}
                      fact={fact}
                      busy={updateFact.isPending || deleteFact.isPending}
                      onSaveText={(t) => void saveText(fact, t)}
                      onDelete={() => void remove(fact)}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Rejected — behind a disclosure */}
            {rejected.length > 0 && (
              <section>
                <button
                  type="button"
                  onClick={() => setRejectedOpen((v) => !v)}
                  aria-expanded={rejectedOpen}
                  className="flex w-full items-center justify-between px-2 py-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary rounded-lg"
                >
                  <span className="font-heading font-semibold uppercase tracking-wide text-base text-on-surface-variant">
                    Rejected ({rejected.length})
                  </span>
                  <span
                    className={`material-symbols-outlined text-on-surface-variant transition-transform ${
                      rejectedOpen ? 'rotate-180' : ''
                    }`}
                    aria-hidden="true"
                  >
                    expand_more
                  </span>
                </button>
                {rejectedOpen && (
                  <div className="mt-2 space-y-3">
                    {rejected.map((fact) => (
                      <div key={fact.id} className="glass-card p-4 space-y-3 opacity-80">
                        <p className="text-base text-on-surface-variant leading-relaxed line-through decoration-on-surface-variant/40">
                          {fact.text}
                        </p>
                        <div className="flex flex-wrap items-center gap-2">
                          <CategoryBadge category={fact.category} />
                          <span className="text-xs text-on-surface-variant">{provenance(fact)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => void decide(fact, 'confirmed')}
                            disabled={mutationBusy}
                            className="flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium text-primary hover:bg-primary/10 transition-colors disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                          >
                            <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
                              undo
                            </span>
                            Restore
                          </button>
                          <button
                            type="button"
                            onClick={() => void remove(fact)}
                            disabled={mutationBusy}
                            className="flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium text-coral hover:bg-coral/10 transition-colors disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-coral"
                          >
                            <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
                              delete
                            </span>
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}

            {/* Add a memory */}
            <section>
              <h3 className="font-heading font-semibold uppercase tracking-wide text-base text-on-surface-variant mb-3 px-2">
                Add a memory
              </h3>
              <form onSubmit={(e) => void onAdd(e)} className="glass-card p-card-padding space-y-4">
                <Input
                  label="What should your coach remember?"
                  icon="edit_note"
                  placeholder="e.g. I train before work on weekdays"
                  maxLength={280}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                />
                <div className="space-y-2">
                  <span className="block text-sm font-medium text-on-surface-variant ml-1">
                    Category
                  </span>
                  <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Memory category">
                    {CATEGORIES.map((c) => (
                      <Chip
                        key={c.value}
                        label={c.label}
                        tone={c.tone}
                        icon={c.icon}
                        active={category === c.value}
                        onClick={() => {
                          haptic('selection');
                          setCategory(c.value);
                        }}
                      />
                    ))}
                  </div>
                  <p className="text-xs text-on-surface-variant ml-1">
                    {CATEGORY_META[category].helper}.
                  </p>
                </div>
                <PrimaryButton
                  type="submit"
                  loading={addFact.isPending}
                  disabled={text.trim() === ''}
                  className="min-h-[48px]"
                >
                  Remember this
                </PrimaryButton>
              </form>
            </section>

            {/* Forget everything */}
            <section>
              <div className="glass-card border-coral/40 p-card-padding space-y-3">
                <p className="text-xs text-on-surface-variant leading-relaxed">
                  Forgetting everything permanently deletes the summary and every memory above.
                  Your coach starts fresh — this cannot be undone.
                </p>
                <SecondaryButton
                  onClick={() => setConfirmForget(true)}
                  disabled={mutationBusy || (facts.length === 0 && !memory)}
                  className="border-coral text-coral hover:bg-coral/10 min-h-[48px]"
                >
                  Forget everything
                </SecondaryButton>
              </div>
            </section>
          </>
        )}
      </main>

      {/* Forget-everything confirmation dialog */}
      {confirmForget && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center px-container-margin bg-black/60 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="forget-dialog-title"
        >
          <div className="glass-card w-full max-w-sm p-card-padding space-y-4">
            <h4
              id="forget-dialog-title"
              className="font-heading font-semibold uppercase tracking-wide text-xl text-coral"
            >
              Forget everything?
            </h4>
            <p className="text-sm text-on-surface-variant leading-relaxed">
              Every memory and the coach summary will be permanently deleted. Aqua Coach will
              still work — it just starts with a blank slate.
            </p>
            <div className="space-y-2">
              <PrimaryButton
                onClick={() => void onForgetEverything()}
                loading={clearMemory.isPending}
                className="!bg-none bg-error-container text-on-error-container"
              >
                Yes, forget everything
              </PrimaryButton>
              <SecondaryButton onClick={() => setConfirmForget(false)} disabled={clearMemory.isPending}>
                Cancel
              </SecondaryButton>
            </div>
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  );
}
