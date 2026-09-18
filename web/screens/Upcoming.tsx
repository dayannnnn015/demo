import { Callout } from '../components/primitives';

/**
 * An honest placeholder. Every module the school will eventually use appears in
 * the navigation, so a staff member can see the shape of the finished system
 * during a walkthrough instead of guessing what is missing. Each one states what
 * the screen will do and, where it applies, what it is waiting on.
 */
export function Upcoming({ summary, detail, blocked }: { summary: string; detail: string; blocked?: string | undefined }) {
  return (
    <div className="card">
      <div className="card-body">
        <div className="empty">
          <h3>{summary}</h3>
          <p>{detail}</p>
        </div>
        {blocked
          ? <Callout tone="attention" title="Waiting on the school">{blocked}</Callout>
          : <Callout tone="info" title="Not built yet">The workflow behind this screen already exists in the API and is covered by tests. Only the interface is outstanding.</Callout>}
      </div>
    </div>
  );
}
