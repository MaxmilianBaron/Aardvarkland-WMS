export function ProgressBar({ value, label }: { value: number; label?: string }) {
  return (
    <div className="progress" aria-label={label ?? `Progress ${value}%`}>
      <div className="progress__bar" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}
