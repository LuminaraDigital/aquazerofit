import type { ReactNode } from 'react';

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: string;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="glass-card p-8 flex flex-col items-center text-center gap-3">
      <span
        className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center"
        aria-hidden="true"
      >
        <span className="material-symbols-outlined text-3xl text-primary">{icon}</span>
      </span>
      <h3 className="font-heading font-semibold uppercase tracking-wide text-lg text-on-surface">
        {title}
      </h3>
      {body && <p className="text-sm text-on-surface-variant max-w-xs">{body}</p>}
      {action && <div className="mt-2 w-full">{action}</div>}
    </div>
  );
}
