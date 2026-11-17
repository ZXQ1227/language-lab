// Shared skeleton for pages whose real content lands with later tasks.
// Shows the page identity plus what will live here, so e2e navigation can
// assert on every route.

interface PagePlaceholderProps {
  title: string;
  description: string;
  planned: string[];
}

export function PagePlaceholder({ title, description, planned }: PagePlaceholderProps) {
  return (
    <section aria-label={title} className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      </div>
      <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
          Planned for this page
        </p>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-600">
          {planned.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}
