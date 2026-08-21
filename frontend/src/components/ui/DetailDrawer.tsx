import { pickLanguage } from '../../core/i18n/i18n';
import { PropsWithChildren, ReactNode } from 'react';
import { Button } from './Button';
import { cx } from '../../core/utils/format';
import { useWorkspace } from '../../core/workspace/workspace';

export function DetailDrawer({ open, onClose, title, eyebrow, footer, children }: PropsWithChildren<{ open: boolean; onClose: () => void; title: string; eyebrow?: string; footer?: ReactNode }>) {
  const { language } = useWorkspace();
  const closeLabel = pickLanguage(language, { cs: 'Zavřít', en: 'Close', ua: 'Закрити' });

  return <aside className={cx('detail-drawer', open && 'is-open')} aria-hidden={!open}><div className="detail-drawer__panel"><header className="detail-drawer__header"><div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h2>{title}</h2></div><Button size="sm" tone="ghost" onClick={onClose}>{closeLabel}</Button></header><div className="detail-drawer__body">{children}</div>{footer && <footer className="detail-drawer__footer">{footer}</footer>}</div></aside>;
}
