import { useState } from 'react';
import type { User } from '../data/mock';

type Size = 'sm' | 'md' | 'lg';

/**
 * Renders a user's profile picture, with a graceful fallback to colored
 * initials. We prefer the image when the user's Pod exposes one (vcard:photo
 * / foaf:img / as:icon, surfaced by SemApps getIdentity as `avatarUrl`).
 *
 * If the image fails to load — Pod ACL blocks our origin, the resource was
 * deleted, the user is offline — we silently fall back to initials. That's
 * preferable to a broken-image icon next to someone's name in a peer-review
 * decision context.
 */
export default function Avatar({ user, size = 'md' }: { user: User; size?: Size }) {
  const className = size === 'md' ? 'avatar' : `avatar avatar--${size}`;
  const [failed, setFailed] = useState(false);

  if (user.avatarUrl && !failed) {
    return (
      <img
        className={className}
        src={user.avatarUrl}
        alt={user.name}
        title={user.name}
        onError={() => setFailed(true)}
        // Pod images live on a different origin than this app; declaring
        // crossorigin lets us style them with CSS filters later without the
        // browser tainting the canvas.
        crossOrigin="anonymous"
        referrerPolicy="no-referrer"
      />
    );
  }

  return (
    <span
      className={className}
      style={{ background: user.avatarColor }}
      aria-label={user.name}
      title={user.name}
    >
      {user.avatarInitials}
    </span>
  );
}
