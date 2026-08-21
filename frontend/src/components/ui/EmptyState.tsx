import { Button } from './Button';

export function EmptyState({ title, text, action }: { title: string; text: string; action?: string }) {
  return (
    <div className="empty-state">
      <h3>{title}</h3>
      <p>{text}</p>
      {action && <Button tone="primary">{action}</Button>}
    </div>
  );
}
