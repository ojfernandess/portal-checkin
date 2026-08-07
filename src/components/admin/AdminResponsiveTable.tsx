import { cn } from "@/lib/utils";

export type AdminTableColumn<T> = {
  id: string;
  header: React.ReactNode;
  className?: string;
  cell: (row: T) => React.ReactNode;
  mobileLabel?: React.ReactNode;
  mobilePrimary?: boolean;
  hideOnMobile?: boolean;
};

type AdminResponsiveTableProps<T> = {
  columns: AdminTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  empty?: React.ReactNode;
  loading?: boolean;
  loadingRows?: number;
  title?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  minTableWidth?: string;
};

export function AdminResponsiveTable<T>({
  columns,
  rows,
  rowKey,
  empty,
  loading = false,
  loadingRows = 4,
  title,
  action,
  className,
  minTableWidth = "640px",
}: AdminResponsiveTableProps<T>) {
  const mobileColumns = columns.filter((column) => !column.hideOnMobile);
  const primaryColumns = mobileColumns.filter((column) => column.mobilePrimary);
  const detailColumns = mobileColumns.filter((column) => !column.mobilePrimary);

  const header = title || action ? (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 px-3 py-3 sm:px-4">
      {title ? <div className="min-w-0 text-base font-semibold">{title}</div> : <span />}
      {action}
    </div>
  ) : null;

  if (loading) {
    return (
      <section className={cn("rounded-xl border border-border/80 bg-card shadow-sm", className)}>
        {header}
        <div className="space-y-2 p-3 sm:p-4">
          {Array.from({ length: loadingRows }).map((_, index) => (
            <div key={index} className="h-14 animate-pulse rounded-lg bg-muted/60" />
          ))}
        </div>
      </section>
    );
  }

  if (rows.length === 0) {
    return (
      <section className={cn("rounded-xl border border-border/80 bg-card shadow-sm", className)}>
        {header}
        <div className="p-3 text-sm text-muted-foreground sm:p-4">{empty}</div>
      </section>
    );
  }

  return (
    <section className={cn("rounded-xl border border-border/80 bg-card shadow-sm", className)}>
      {header}

      <div className="md:hidden divide-y divide-border/60">
        {rows.map((row) => (
          <article key={rowKey(row)} className="space-y-3 p-3 sm:p-4">
            {primaryColumns.length > 0 ? (
              <div className="space-y-1">
                {primaryColumns.map((column) => (
                  <div key={column.id}>{column.cell(row)}</div>
                ))}
              </div>
            ) : null}
            {detailColumns.length > 0 ? (
              <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {detailColumns.map((column) => (
                  <div key={column.id} className="min-w-0">
                    <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      {column.mobileLabel ?? column.header}
                    </dt>
                    <dd className="mt-0.5 text-sm">{column.cell(row)}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </article>
        ))}
      </div>

      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm" style={{ minWidth: minTableWidth }}>
          <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              {columns.map((column) => (
                <th key={column.id} className={cn("px-4 py-2.5 font-medium", column.className)}>
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={rowKey(row)}
                className="border-t border-border/60 transition-colors hover:bg-muted/20"
              >
                {columns.map((column) => (
                  <td key={column.id} className={cn("px-4 py-3 align-top", column.className)}>
                    {column.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
