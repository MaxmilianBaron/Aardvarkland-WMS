import { PropsWithChildren } from 'react';
import type { Severity } from '../../core/types/wms';
import { cx } from '../../core/utils/format';

interface BadgeProps {
  tone?: Severity;
  compact?: boolean;
}

export function Badge({ children, tone = 'neutral', compact }: PropsWithChildren<BadgeProps>) {
  return <span className={cx('badge', `badge--${tone}`, compact && 'badge--compact')}>{children}</span>;
}
