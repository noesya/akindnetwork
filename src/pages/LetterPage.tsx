import { Link, useParams } from 'react-router-dom';
import { letters, comments } from '../data/mock';
import LetterView from '../components/LetterView';
import Thread from '../components/Thread';

export default function LetterPage() {
  const { id } = useParams();
  const idx = letters.findIndex((l) => l.id === id);
  const letter = letters[idx];
  if (!letter) {
    return (
      <div style={{ maxWidth: 720, margin: 'var(--space-7) auto', padding: '0 var(--space-5)' }}>
        <h1 className="serif">Lettre introuvable</h1>
        <p>
          <Link to="/read">Retour à la lecture</Link>
        </p>
      </div>
    );
  }
  const letterComments = comments.filter((c) => c.letterId === letter.id);
  const prevId = letters[idx - 1]?.id ?? null;
  const nextId = letters[idx + 1]?.id ?? null;

  return (
    <>
      <nav className="read-nav">
        {prevId ? (
          <Link to={`/read/${prevId}`} className="read-nav__arrow">
            ← précédente
          </Link>
        ) : (
          <span />
        )}
        <span className="read-nav__counter">{idx + 1} / {letters.length}</span>
        {nextId ? (
          <Link to={`/read/${nextId}`} className="read-nav__arrow">
            suivante →
          </Link>
        ) : (
          <span />
        )}
      </nav>
      <LetterView letter={letter} />
      <Thread comments={letterComments} />
    </>
  );
}
