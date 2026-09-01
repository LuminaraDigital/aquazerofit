/**
 * Keyboard-first meal logging (AQF-27 §2.2).
 *
 * Ctrl/⌘ K opens a typist's front door onto the chat meal-extraction lane.
 * The server parses and proposes; nothing is logged until the user confirms
 * on the coach surface.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import type { ChatMealDraft } from '@/pages/coach/mealDraft';
import { todayLocalDate } from '@/pages/dashboard/lib';

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return target.isContentEditable;
}

export function CommandPalette() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const proposeMeal = useMutation({
    mutationFn: (mealText: string) =>
      api<{ draft: ChatMealDraft }>('/chat/meal-drafts', {
        method: 'POST',
        body: { text: mealText, localDate: todayLocalDate() },
      }),
    onSuccess: async (data) => {
      setOpen(false);
      setText('');
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ['chat', 'meal-drafts'] });
      navigate('/coach', { state: { mealDraftId: data.draft.id } });
    },
    onError: (e) => {
      setError(e instanceof ApiError ? e.message : 'Could not read that as a meal.');
    },
  });

  const close = useCallback(() => {
    if (proposeMeal.isPending) return;
    setOpen(false);
    setText('');
    setError(null);
  }, [proposeMeal.isPending]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((value) => !value);
        setError(null);
        return;
      }
      if (event.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [close]);

  useEffect(() => {
    if (open) {
      const id = window.setTimeout(() => inputRef.current?.focus(), 0);
      return () => window.clearTimeout(id);
    }
    return undefined;
  }, [open]);

  if (!open) return null;

  const submit = () => {
    const trimmed = text.trim();
    if (trimmed.length < 1 || proposeMeal.isPending) return;
    setError(null);
    proposeMeal.mutate(trimmed);
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center bg-black/50 backdrop-blur-sm px-4 pt-[min(20vh,8rem)]"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Log a meal from text"
        className="w-full max-w-lg rounded-2xl border border-outline/40 bg-surface shadow-2xl overflow-hidden"
      >
        <div className="flex items-center gap-3 border-b border-outline/30 px-4 py-3">
          <span className="material-symbols-outlined text-primary" aria-hidden="true">
            restaurant
          </span>
          <input
            ref={inputRef}
            type="text"
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                submit();
              }
              if (event.key === 'Escape') {
                event.preventDefault();
                close();
              }
              if (isEditableTarget(event.target) && event.key !== 'Tab') {
                event.stopPropagation();
              }
            }}
            placeholder="2 eggs, toast, black coffee"
            aria-label="Describe what you ate"
            className="flex-1 bg-transparent border-none outline-none text-on-surface placeholder:text-outline/50 text-base"
            disabled={proposeMeal.isPending}
          />
          <kbd className="hidden sm:inline text-[10px] uppercase tracking-wider text-on-surface-variant/60 border border-outline/40 rounded px-1.5 py-0.5">
            Esc
          </kbd>
        </div>
        <div className="px-4 py-3 text-sm text-on-surface-variant/80 flex items-start justify-between gap-4">
          <p>
            Type a meal, press Enter, confirm on the coach screen. Faster than any tap flow.
          </p>
          <kbd className="shrink-0 text-[10px] uppercase tracking-wider text-on-surface-variant/60 border border-outline/40 rounded px-1.5 py-0.5">
            ⌘K
          </kbd>
        </div>
        {error && (
          <p className="px-4 pb-3 text-sm text-tertiary-container" role="alert">
            {error}
          </p>
        )}
        {proposeMeal.isPending && (
          <p className="px-4 pb-3 text-sm text-on-surface-variant" aria-live="polite">
            Reading your meal…
          </p>
        )}
      </div>
    </div>
  );
}
