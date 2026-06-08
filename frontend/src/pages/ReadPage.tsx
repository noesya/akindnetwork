import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import LetterView from '../components/LetterView';
import Thread from '../components/Thread';
import { useLetters, useComments } from '../hooks/useLetters';
import { toSlug } from '../lib/letterSlug';

export default function ReadPage() {
  const { t, i18n } = useTranslation();
  const { letters, isLoading } = useLetters();
  const letter = letters[0];
  const { comments: letterComments } = useComments(letter?.id);

  if (isLoading) {
    return <p className="muted" style={{ textAlign: 'center', marginTop: 'var(--space-7)' }}>…</p>;
  }
  if (!letter) {
    return (
      <div style={{ textAlign: 'center', marginTop: 'var(--space-7)' }}>
        <p className="muted">{t('letter.noLetterYet')}</p>
      </div>
    );
  }

  return (
    <>
      <ReadNav current={1} total={letters.length} prevId={null} nextId={letters[1] ? toSlug(letters[1].id) : null} />
      <LetterView letter={letter} />
      <Thread comments={letterComments} />
    </>
  );
}

function ReadNav({
  current,
  total,
  prevId,
  nextId
}: {
  current: number;
  total: number;
  prevId: string | null;
  nextId: string | null;
}) {
  return (
    <nav className="read-nav">
      <span className="read-nav__previous">
        {prevId && (
          <Link to={`/read/${prevId}`} className="read-nav__arrow">
            ← précédente
          </Link>
        )}
      </span>
      <span className="read-nav__counter">
        {current} / {total}
      </span>
      <span className="read-nav__next">
        {nextId && (
          <Link to={`/read/${nextId}`} className="read-nav__arrow">
            suivante →
          </Link>
        )}
      </span>
    </nav>
  );
}
