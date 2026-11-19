import { useTranslation } from "react-i18next";
// Shared skeleton for pages whose real content lands with later tasks.
// Shows the page identity plus what will live here, so e2e navigation can
// assert on every route.

interface PagePlaceholderProps {
  title: string;
  description: string;
  planned: string[];
}

export function PagePlaceholder({ title, description, planned }: PagePlaceholderProps) {
  const { t } = useTranslation();
  return (
    <section aria-label={title} className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">{title}</h1>
        <p className="mt-1 text-sm text-ink-muted">{description}</p>
      </div>
      <div className="rounded-lg border border-dashed border-line-strong bg-surface-secondary p-6">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">
          {t("common:plannedForThisPage")}
        </p>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-ink-muted">
          {planned.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}
