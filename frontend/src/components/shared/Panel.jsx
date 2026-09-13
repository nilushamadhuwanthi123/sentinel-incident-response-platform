/**
 * Panel — the one container every surface in SENTINEL sits in.
 *
 * Exists so that a panel heading is always a real heading element at a
 * level the page controls, and always announced. Components that draw
 * their own box-with-a-title inevitably drift: one becomes a div, one
 * skips a heading level, and the document outline stops meaning anything.
 */

export function Panel({
  title,
  hint,
  actions,
  headingLevel = 2,
  tone = 'default',
  children,
  ...rest
}) {
  const Heading = `h${headingLevel}`;
  const titleId = `panel-${String(title).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

  return (
    <section
      className={`panel panel--${tone}`}
      aria-labelledby={title ? titleId : undefined}
      {...rest}
    >
      {title && (
        <div className="panel-head">
          <Heading id={titleId} className="panel-title">
            {title}
          </Heading>
          {hint && <span className="panel-hint">{hint}</span>}
          {actions && <div className="panel-actions">{actions}</div>}
        </div>
      )}
      <div className="panel-body">{children}</div>
    </section>
  );
}
