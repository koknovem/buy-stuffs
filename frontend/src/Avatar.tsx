import type { Member } from './types';

export function Avatar({
  user,
  size = 'md',
}: {
  user?: Member | { displayName: string; picture: string } | null;
  size?: 'sm' | 'md' | 'lg';
}) {
  const cls = `avatar ${size === 'lg' ? 'lg' : size === 'sm' ? 'sm' : ''}`;
  if (user?.picture) {
    return <img className={cls} src={user.picture} alt={user.displayName} referrerPolicy="no-referrer" />;
  }
  const letter = (user?.displayName || '?').slice(0, 1).toUpperCase();
  return <span className={`${cls} avatar-fallback`}>{letter}</span>;
}
