import { ListChecks } from 'lucide-react';

export function ReviewView() {
  return (
    <section className="h-full overflow-y-auto px-4 py-5 sm:px-6" aria-labelledby="review-title">
      <div className="mx-auto max-w-5xl">
        <div className="border-b border-pc-border pb-4">
          <h1 id="review-title" className="text-base font-semibold text-pc-text">Review</h1>
          <p className="mt-1 text-xs text-pc-text-muted">Proposed actions and uncertain records</p>
        </div>
        <div className="min-h-64 flex flex-col items-center justify-center text-center">
          <ListChecks size={28} className="mb-3 text-pc-text-faint" />
          <p className="text-sm font-medium text-pc-text-secondary">Nothing waiting for review</p>
          <p className="mt-1 text-xs text-pc-text-muted">Approved workflows will place durable proposals in this queue.</p>
        </div>
      </div>
    </section>
  );
}
