import { PageHeader } from "@/presentation/admin/ui/page-header";
import { EmptyState } from "@/presentation/admin/ui/states";

type DestinationPlaceholderProps = Readonly<{
  title: string;
  description: string;
  /** Current, real figures for this area. */
  facts: readonly Readonly<{ label: string; value: string }>[];
  upcoming: readonly string[];
}>;

// A destination whose editing tools are not built yet. It still shows live
// figures, so staff can see what exists without being offered fake actions.
export function DestinationPlaceholder({
  title,
  description,
  facts,
  upcoming,
}: DestinationPlaceholderProps) {
  return (
    <>
      <PageHeader title={title} description={<p>{description}</p>} />
      <dl className="admin-facts">
        {facts.map((fact) => (
          <div key={fact.label}>
            <dt>{fact.label}</dt>
            <dd>{fact.value}</dd>
          </div>
        ))}
      </dl>
      <EmptyState title={`${title} editing is not available yet`}>
        <p>This area is being built. When it is ready you will be able to:</p>
        <ul>
          {upcoming.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </EmptyState>
    </>
  );
}
