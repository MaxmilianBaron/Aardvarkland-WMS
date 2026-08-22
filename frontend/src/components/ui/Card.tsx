import { PropsWithChildren, ReactNode } from 'react';
import { cx } from '../../core/utils/format';

interface CardProps {
  title?: string;
  eyebrow?: string;
  action?: ReactNode;
  className?: string;
}

export function Card({ title, eyebrow, action, className, children }: PropsWithChildren<CardProps>) {
  return (
    <section className={cx('card', className)}>
      {(title || eyebrow || action) && (
        <header className="card__header">
          <div className="card__title">
            {eyebrow && <p className="eyebrow">{eyebrow}</p>}
            {title && <h2>{title}</h2>}
          </div>
          {action && <div className="card__action">{action}</div>}
        </header>
      )}
      {children}
    </section>
  );
}
