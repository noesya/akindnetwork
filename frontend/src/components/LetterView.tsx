import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { Letter, Source } from '../data/mock';
import { users } from '../data/mock';
import Avatar from './Avatar';
import SidebarField from './SidebarField';
import SourceModal from './SourceModal';

export default function LetterView({ letter, showActions = true }: { letter: Letter; showActions?: boolean }) {
  const { t, i18n } = useTranslation();
  const [openSource, setOpenSource] = useState<Source | null>(null);
  const author = users[letter.authorId];

  return (
    <>
      <article className="letter-view">
        <aside className="letter-view__author">
          <Avatar user={author} size="lg" />
          <div className="letter-view__author-name">{author.name}</div>
          <div className="letter-view__author-bio">{author.bio}</div>
        </aside>

        <div className="letter-view__content">
          {letter.respondsTo && (
            <div style={{ marginBottom: 'var(--space-6)', fontSize: 14, color: 'var(--color-text-muted)' }}>
              <span className="muted">{t('letter.inResponseTo')}</span>
              <br />
              <Link to={`/read/${letter.respondsTo.id}`}>
                « {letter.respondsTo.title} »
              </Link>{' '}
              <span className="muted">
                {t('letter.byAuthor', { name: users[letter.respondsTo.authorId].name })},{' '}
                {formatDate(letter.respondsTo.publishedAt, i18n.language)}.
              </span>
            </div>
          )}

          <h1 className="letter-view__title">{letter.title}</h1>
          <div className="letter-view__body">
            {letter.paragraphs.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>

          {showActions && (
            <div className="letter-view__actions">
              <Link to="/write" className="btn">
                {t('letter.respondPublicly')}
              </Link>
              <button className="btn btn--ghost">
                {t('letter.writeToAuthor', { name: author.name.split(' ')[0] })}
              </button>
            </div>
          )}
        </div>

        <aside className="letter-view__sidebar">
          <SidebarField label={t('letter.when')}>{formatDate(letter.publishedAt, i18n.language)}</SidebarField>
          {letter.about && (
            <SidebarField label={t('letter.about')}>
              <a href="#" onClick={(e) => e.preventDefault()}>« {letter.about.title} »</a>
              {letter.about.author && (
                <> {t('letter.byAuthor', { name: letter.about.author })}</>
              )}
            </SidebarField>
          )}
          {letter.approvedBy.length > 0 && (
            <SidebarField label={t('letter.approvedBy')}>
              {letter.approvedBy.map((id, i) => (
                <span key={id}>
                  <a href="#" onClick={(e) => e.preventDefault()}>
                    {users[id]?.name ?? id}
                  </a>
                  {i < letter.approvedBy.length - 1 ? ' & ' : ''}
                </span>
              ))}
            </SidebarField>
          )}
          {letter.sources.length > 0 && (
            <SidebarField label={t('letter.sources')}>
              {letter.sources.map((src) => (
                <div key={src.id} style={{ marginBottom: 'var(--space-2)' }}>
                  <a
                    href={src.url}
                    onClick={(e) => {
                      e.preventDefault();
                      setOpenSource(src);
                    }}
                  >
                    {truncate(src.url, 48)}
                  </a>
                </div>
              ))}
            </SidebarField>
          )}
        </aside>
      </article>

      {openSource && <SourceModal source={openSource} onClose={() => setOpenSource(null)} />}
    </>
  );
}

function formatDate(iso: string, lang: string) {
  const d = new Date(iso);
  return d.toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}
