import type { User } from '../data/mock';

type Size = 'sm' | 'md' | 'lg';

export default function Avatar({ user, size = 'md' }: { user: User; size?: Size }) {
  const className = size === 'md' ? 'avatar' : `avatar avatar--${size}`;
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
