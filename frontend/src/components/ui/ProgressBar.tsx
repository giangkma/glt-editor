interface ProgressBarProps {
  /** 0 - 100 */
  value: number;
  label: string;
}

export function ProgressBar({ value, label }: ProgressBarProps) {
  const pct = Math.min(100, Math.max(0, value));
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-label={label}
      className="relative h-1.5 w-full overflow-hidden rounded-full bg-ink-700"
    >
      <div
        className="relative h-full rounded-full bg-accent shadow-[0_0_16px_rgba(198,255,61,0.6)] transition-[width] duration-300 ease-out"
        style={{ width: `${pct}%` }}
      >
        <div className="absolute inset-0 overflow-hidden rounded-full">
          <div className="h-full w-1/2 animate-shimmer bg-gradient-to-r from-transparent via-white/50 to-transparent" />
        </div>
      </div>
    </div>
  );
}
