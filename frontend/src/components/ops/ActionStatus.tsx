import { pickLanguage } from '../../core/i18n/i18n';
import { ApiMutationState } from '../../core/api/useApiMutation';
import { useWorkspace } from '../../core/workspace/workspace';
import { Badge } from '../ui/Badge';

interface ActionStatusProps {
  mutation: Pick<ApiMutationState, 'status' | 'message'>;
}

export function ActionStatus({ mutation }: ActionStatusProps) {
  const { language } = useWorkspace();
  if (mutation.status === 'idle' || !mutation.message) return null;

  const tone = mutation.status === 'success' ? 'good' : mutation.status === 'error' ? 'critical' : 'warning';
  const label = mutation.status === 'success'
    ? 'API OK'
    : mutation.status === 'error'
      ? (pickLanguage(language, { cs: 'API chyba', en: 'API error', ua: 'Помилка API' }))
      : (pickLanguage(language, { cs: 'Volání API', en: 'API call', ua: 'Виклик API' }));

  return (
    <div className="inline-banner action-status">
      <Badge tone={tone}>{label}</Badge>
      <span>{mutation.message}</span>
    </div>
  );
}
