import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import Avatar from '../components/Avatar';
import DemoBanner from '../components/DemoBanner';
import { users as mockUsers, letters as mockLetters, type User } from '../data/mock';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { fetchByAuthor, type LetterEntry } from '../lib/lettersApi';
import { isAuthConfigured } from '../providers/setup';
import { toSlug } from '../lib/letterSlug';

/**
 * /u/:username — public profile page. Shows the user's identity card on
 * top (avatar + name + bio when we know them) and the list of their
 * published letters underneath. Authored letters appear here regardless
 * of whether they're roots or leaf replies (the topological filter that
 * trims /read is intentionally NOT applied on a profile page).
 */
export default function UserPage() {
  const { username = '' } = useParams();
  const { t, i18n } = useTranslation();
  const { user: me, isAuthenticated } = useCurrentUser();

  // For now the "user profile" data we can show comes from two sources:
  //   - the mock `users` map (for demo / known seed users), or
  //   - the current user themselves when they visit their own page.
  // Unknown authors get a minimal stub. A future "users" service could
  // resolve a WebID to a real foaf/vcard profile.
  const author: User =
    mockUsers[username] ||
    (me.id === username && !me.isMock ? me : null) ||
    {
      id: username,
      webId: '',
      name: username,
      bio: '',
      avatarInitials: (username[0] || '?').toUpperCase(),
      avatarColor: '#314a62'
    };

  const [letters, setLetters] = useState<LetterEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!isAuthConfigured || !isAuthenticated) {
      // Demo mode — pull from mock data.
      const ls = mockLetters
        .filter((l) => l.authorId === username && l.status === 'published')
        .map(
          (l): LetterEntry => ({
            uri: l.id,
            uuid: l.id,
            authorWebId: '',
            parentUri: l.respondsTo?.id || null,
            status: 'published',
            publishedAt: l.publishedAt,
            title: l.title,
            content: l.paragraphs.join('\n\n'),
            language: l.language,
            sources: l.sources.map((s) => s.url),
            approvedBy: [],
            rejectedBy: [],
            assignedReviewers: []
          })
        );
      setLetters(ls);
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    fetchByAuthor(username)
      .then((r) => {
        if (!cancelled) setLetters(r.letters);
      })
      .catch((e) => {
        if (cancelled) return;
        console.warn('[UserPage] fetchByAuthor failed:', e?.message || e);
        setLetters([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthConfigured, isAuthenticated, username]);

  return (
    <div className="user-page">
      {me.isMock && <DemoBanner />}

      <header className="user-page__header">
        <Avatar user={author} size="lg" />
        <div>
          <div className="user-page__name">{author.name}</div>
          {author.bio && <div className="user-page__bio">{author.bio}</div>}
        </div>
      </header>

      <section className="user-page__section">
        <h2 className="user-page__section-title">
          {t('user.publishedLetters')}
        </h2>
        {isLoading ? (
          <p className="muted">…</p>
        ) : letters.length === 0 ? (
          <p className="muted">{t('user.noLetters')}</p>
        ) : (
          letters.map((l) => (
            <Link
              key={l.uri}
              to={`/read/${toSlug(l.uri)}`}
              className="user-page__item"
            >
              <span>{l.title || t('me.untitledDraft')}</span>
              <span className="user-page__item-meta">
                {formatDate(l.publishedAt, i18n.language)}
              </span>
            </Link>
          ))
        )}
      </section>
    </div>
  );
}

function formatDate(iso: string | null, lang: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
}
