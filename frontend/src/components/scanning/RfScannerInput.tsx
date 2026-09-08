import { InputHTMLAttributes, KeyboardEvent, useEffect, useRef } from 'react';

interface RfScannerInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  onSubmitValue?: () => void;
  submitOnIdleMs?: number;
  minAutoSubmitLength?: number;
}

export function RfScannerInput({
  label,
  value,
  onValueChange,
  onSubmitValue,
  submitOnIdleMs = 140,
  minAutoSubmitLength = 4,
  disabled,
  ...inputProps
}: RfScannerInputProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const idleTimer = useRef<number | null>(null);
  const keyTimes = useRef<number[]>([]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [disabled, inputProps.placeholder]);

  useEffect(() => () => clearIdleTimer(), []);

  const clearIdleTimer = () => {
    if (idleTimer.current !== null) {
      window.clearTimeout(idleTimer.current);
      idleTimer.current = null;
    }
  };

  const maybeSubmitAfterIdle = (nextValue: string) => {
    clearIdleTimer();
    if (!onSubmitValue || nextValue.trim().length < minAutoSubmitLength || !looksLikeRapidScan(keyTimes.current)) {
      return;
    }

    idleTimer.current = window.setTimeout(() => {
      onSubmitValue();
    }, submitOnIdleMs);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === 'Tab') {
      event.preventDefault();
      clearIdleTimer();
      onSubmitValue?.();
      return;
    }

    if (event.key.length === 1) {
      const now = performance.now();
      keyTimes.current = [...keyTimes.current.filter((time) => now - time < 300), now].slice(-12);
    }

    inputProps.onKeyDown?.(event);
  };

  return (
    <label className="rf-scanner-input">
      {label}
      <input
        {...inputProps}
        ref={inputRef}
        value={value}
        disabled={disabled}
        onKeyDown={onKeyDown}
        onChange={(event) => {
          const nextValue = event.target.value;
          onValueChange(nextValue);
          maybeSubmitAfterIdle(nextValue);
        }}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
      />
    </label>
  );
}

function looksLikeRapidScan(times: number[]): boolean {
  if (times.length < 4) {
    return false;
  }

  const intervals = times.slice(1).map((time, index) => time - times[index]);
  const fastIntervals = intervals.filter((interval) => interval <= 45).length;
  return fastIntervals >= Math.min(4, intervals.length);
}
