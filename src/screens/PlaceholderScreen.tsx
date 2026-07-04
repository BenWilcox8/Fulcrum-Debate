/**
 * A trivial placeholder body for a routed area. Real feature screens replace
 * these later; for now they just name the region so navigation is observable.
 */
export default function PlaceholderScreen({
  title,
  blurb,
}: {
  title: string;
  blurb: string;
}) {
  return (
    <section
      aria-labelledby="screen-heading"
      className="flex flex-col gap-2"
    >
      <h2
        id="screen-heading"
        className="text-2xl font-semibold tracking-tight text-shell-text"
      >
        {title}
      </h2>
      <p className="max-w-prose text-sm text-shell-muted">{blurb}</p>
    </section>
  );
}
