import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { Comment } from '../data/mock';
import { users } from '../data/mock';
import Avatar from './Avatar';
import SidebarField from './SidebarField';

export default function Thread({ comments }: { comments: Comment[] }) {
  const { t, i18n } = useTranslation();

  if (comments.length === 0) return null;

  return (
    <section className="thread">
      <div className="thread__divider" />
      {comments.map((c) => {
        const author = users[c.authorId];
        return (
          <div className="comment" key={c.id}>
            <div className="comment__author">
              <Avatar user={author} size="sm" />
              <div className="comment__name">{author.name}</div>
            </div>
            <div className="comment__body">
              {c.paragraphs.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
            <div className="comment__sidebar">
              <SidebarField label={t('letter.when')}>{formatDate(c.publishedAt, i18n.language)}</SidebarField>
              {c.about && (
                <SidebarField label={t('letter.about')}>
                  <a href="#" onClick={(e) => e.preventDefault()}>« {c.about.title} »</a>{' '}
                  {c.about.author && <span>{t('letter.byAuthor', { name: c.about.author })}</span>}
                </SidebarField>
              )}
            </div>
          </div>
        );
      })}
      <div className="thread__compose">
        <Link to="/write" className="btn">
          {t('letter.contribute')}
        </Link>
      </div>
    </section>
  );
}

function formatDate(iso: string, lang: string) {
  return new Date(iso).toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
}
