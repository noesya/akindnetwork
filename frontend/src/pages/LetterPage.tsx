import { Link, useParams } from 'react-router-dom';
import LetterView from '../components/LetterView';
import Thread from '../components/Thread';
import { useLetters, useLetter, useComments } from '../hooks/useLetters';
import { toSlug } from '../lib/letterSlug';

export default function LetterPage() {
  const { id } = useParams();
  const { letters } = useLetters();
  const { letter, isLoading } = useLetter(id);
  const { comments: letterComments } = useComments(letter?.id);

  if (isLoading) {
    return <p className="muted" style={{ textAlign: 'center', marginTop: 'var(--space-7)' }}>…</p>;
  }
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
  const idx = letters.findIndex((l) => l.id === letter.id);
  const prevSlug = letters[idx - 1] ? toSlug(letters[idx - 1].id) : null;
  const nextSlug = letters[idx + 1] ? toSlug(letters[idx + 1].id) : null;

  return (
    <>
      <nav className="read-nav">
        <span className="read-nav__previous">
          {prevSlug && (
            <Link to={`/read/${prevSlug}`} className="read-nav__arrow">
              ← précédente
            </Link>
          )}
        </span>
        <span className="read-nav__counter">{idx + 1} / {letters.length}</span>
        <span className="read-nav__next">
          {nextSlug && (
            <Link to={`/read/${nextSlug}`} className="read-nav__arrow">
              suivante →
            </Link>
          )}
        </span>
      </nav>
      <LetterView letter={letter} />
      <Thread comments={letterComments} />
    </>
  );
}
