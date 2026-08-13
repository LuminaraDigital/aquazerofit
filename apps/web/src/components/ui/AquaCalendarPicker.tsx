import { useEffect, useMemo, useState } from 'react';

export interface DayStatus {
  logged?: boolean;
  targetMet?: boolean;
  streak?: boolean;
}

export interface AquaCalendarPickerProps {
  open: boolean;
  selectedDate: string; // YYYY-MM-DD
  onSelectDate: (date: string) => void;
  onClose: () => void;
  /** Optional status map of YYYY-MM-DD date keys to status flags */
  statusData?: Record<string, DayStatus>;
}

function getDaysInMonth(year: number, monthIndex: number) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function formatMonthYear(year: number, monthIndex: number) {
  const d = new Date(year, monthIndex, 1);
  return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

function toIsoDate(year: number, monthIndex: number, day: number) {
  const m = String(monthIndex + 1).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${year}-${m}-${d}`;
}

export function AquaCalendarPicker({
  open,
  selectedDate,
  onSelectDate,
  onClose,
  statusData = {},
}: AquaCalendarPickerProps) {
  // Extract initial year & month from selectedDate or current date
  const initialDateObj = useMemo(() => {
    const parts = selectedDate.split('-').map(Number);
    if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
      return { year: parts[0], month: parts[1] - 1 };
    }
    const today = new Date();
    return { year: today.getFullYear(), month: today.getMonth() };
  }, [selectedDate]);

  const [year, setYear] = useState(initialDateObj.year);
  const [month, setMonth] = useState(initialDateObj.month);

  useEffect(() => {
    if (open) {
      setYear(initialDateObj.year);
      setMonth(initialDateObj.month);
    }
  }, [open, initialDateObj]);

  if (!open) return null;

  const todayIso = new Date().toISOString().split('T')[0];

  const handlePrevMonth = () => {
    if (month === 0) {
      setMonth(11);
      setYear((y) => y - 1);
    } else {
      setMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (month === 11) {
      setMonth(0);
      setYear((y) => y + 1);
    } else {
      setMonth((m) => m + 1);
    }
  };

  // Calendar grid calculations
  const totalDays = getDaysInMonth(year, month);
  // Get day of week for the 1st of the month (0 = Sunday, 1 = Monday ... 6 = Saturday)
  const firstDayIndex = new Date(year, month, 1).getDay();
  // Adjust so Monday is 0, Sunday is 6
  const startOffset = (firstDayIndex + 6) % 7;

  const weekHeaders = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  const cells = [];
  // Empty padding cells for previous month
  for (let i = 0; i < startOffset; i++) {
    cells.push(null);
  }
  // Days of current month
  for (let d = 1; d <= totalDays; d++) {
    cells.push(d);
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Calendar date picker"
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close calendar modal"
        onClick={onClose}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm transition-opacity"
      />

      {/* Modal Container */}
      <div className="relative z-10 w-full max-w-sm overflow-hidden rounded-3xl border border-border-aqua bg-surface-container-high p-5 shadow-2xl animate-fade-in">
        {/* Modal Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-2xl" aria-hidden="true">
              calendar_month
            </span>
            <h2 className="font-heading text-lg font-bold text-on-surface uppercase tracking-wide">
              {formatMonthYear(year, month)}
            </h2>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Previous month"
              onClick={handlePrevMonth}
              className="w-8 h-8 rounded-full flex items-center justify-center bg-surface-container-low border border-outline-variant text-on-surface hover:bg-surface-container-highest active:scale-95 transition-transform"
            >
              <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
                chevron_left
              </span>
            </button>
            <button
              type="button"
              aria-label="Next month"
              onClick={handleNextMonth}
              className="w-8 h-8 rounded-full flex items-center justify-center bg-surface-container-low border border-outline-variant text-on-surface hover:bg-surface-container-highest active:scale-95 transition-transform"
            >
              <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
                chevron_right
              </span>
            </button>
            <button
              type="button"
              aria-label="Close calendar"
              onClick={onClose}
              className="w-8 h-8 rounded-full flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest ml-1 transition-colors"
            >
              <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
                close
              </span>
            </button>
          </div>
        </div>

        {/* Days of week header */}
        <div className="grid grid-cols-7 gap-1 text-center mb-2">
          {weekHeaders.map((w) => (
            <span key={w} className="text-xs font-bold text-on-surface-variant/80 uppercase">
              {w}
            </span>
          ))}
        </div>

        {/* Calendar Grid */}
        <div className="grid grid-cols-7 gap-1">
          {cells.map((dayNum, idx) => {
            if (dayNum === null) {
              return <div key={`empty-${idx}`} className="h-11 rounded-xl" aria-hidden="true" />;
            }

            const isoDate = toIsoDate(year, month, dayNum);
            const isSelected = isoDate === selectedDate;
            const isToday = isoDate === todayIso;
            const status = statusData[isoDate] || {};

            return (
              <button
                key={isoDate}
                type="button"
                onClick={() => {
                  onSelectDate(isoDate);
                  onClose();
                }}
                className={`relative flex flex-col items-center justify-center h-11 rounded-xl transition-all font-semibold tabular-nums text-sm ${
                  isSelected
                    ? 'cta-gradient text-on-primary font-bold shadow-lg ring-2 ring-primary/60 scale-105'
                    : isToday
                      ? 'border-2 border-primary text-primary bg-primary/10'
                      : 'bg-surface-container-low border border-outline-variant/30 text-on-surface hover:bg-surface-container-highest'
                }`}
              >
                <span>{dayNum}</span>

                {/* Status indicators */}
                <div className="flex items-center gap-0.5 mt-0.5">
                  {status.targetMet && (
                    <span
                      title="Target Met"
                      className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_4px_#10b981]"
                    />
                  )}
                  {status.logged && (
                    <span
                      title="Logged"
                      className="w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_4px_#2fd9f4]"
                    />
                  )}
                  {status.streak && (
                    <span
                      title="Streak Maintained"
                      className="material-symbols-outlined text-[10px] text-amber-400"
                      aria-hidden="true"
                    >
                      local_fire_department
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Legend */}
        <div className="mt-4 pt-3 border-t border-outline-variant/40 flex items-center justify-around text-[11px] text-on-surface-variant">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_4px_#10b981]" />
            <span>Target Met</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_4px_#2fd9f4]" />
            <span>Logged</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[12px] text-amber-400">
              local_fire_department
            </span>
            <span>Streak</span>
          </div>
        </div>
      </div>
    </div>
  );
}
