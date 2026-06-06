import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { letters, comments } from '../data/mock';
import LetterView from '../components/LetterView';
import Thread from '../components/Thread';

export default function ReadPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const letter = letters[0];
  const letterComments = comments.filter((c) => c.letterId === letter.id);

  return (
    <>
      <ReadNav current={1} total={letters.length} prevId={null} nextId={letters[1]?.id ?? null} />
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
      {prevId ? (
        <Link to={`/read/${prevId}`} className="read-nav__arrow">
          ← précédente
        </Link>
      ) : (
        <span />
      )}
      <span className="read-nav__counter">{current} / {total}</span>
      {nextId ? (
        <Link to={`/read/${nextId}`} className="read-nav__arrow">
          suivante →
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
