import { pickLanguage } from '../../core/i18n/i18n';
import { ReactNode } from 'react';
import { EmptyState } from './EmptyState';
import { useWorkspace } from '../../core/workspace/workspace';

export interface Column<T> {
  key: string;
  label: string;
  align?: 'left' | 'right' | 'center';
  render: (row: T) => ReactNode;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  getRowKey: (row: T) => string;
  emptyTitle?: string;
  emptyText?: string;
}

export function DataTable<T>({
  columns,
  rows,
  getRowKey,
  emptyTitle,
  emptyText,
}: DataTableProps<T>) {
  const { language } = useWorkspace();
  const title = emptyTitle ?? (pickLanguage(language, { cs: 'Žádná data', en: 'No data', ua: 'Немає даних' }));
  const text = emptyText ?? (pickLanguage(language, { cs: 'Zkuste obnovit data, změnit filtr nebo ověřit připojení k API.', en: 'Refresh the page, change the filter, or check the API connection.', ua: 'Оновіть сторінку, змініть фільтр або перевірте підключення до API.' }));

  if (rows.length === 0) {
    return <EmptyState title={title} text={text} />;
  }

  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} className={column.align ? `align-${column.align}` : undefined}>{column.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={getRowKey(row)}>
              {columns.map((column) => (
                <td
                  key={column.key}
                  data-label={column.label}
                  className={column.align ? `align-${column.align}` : undefined}
                >
                  <div className="data-table__cell">{column.render(row)}</div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
