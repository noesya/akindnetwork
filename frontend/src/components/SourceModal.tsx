import { useTranslation } from 'react-i18next';
import { useEffect } from 'react';
import type { Source } from '../data/mock';

export default function SourceModal({ source, onClose }: { source: Source; onClose: () => void }) {
  const { t } = useTranslation();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="source-modal__backdrop" onClick={onClose}>
      <div className="source-modal" onClick={(e) => e.stopPropagation()}>
        <button className="source-modal__close" onClick={onClose} aria-label="Close">
          ✕
        </button>
        <header className="source-modal__header">
          <div className="source-modal__publisher">{source.publisher || 'Source'}</div>
          <div className="source-modal__tagline">
            {source.author ? t('letter.byAuthor', { name: source.author }) : ''}
          </div>
        </header>
        <div className="source-modal__card">
          <div style={{ fontFamily: 'var(--font-serif)', fontSize: 22, marginBottom: 'var(--space-3)' }}>
            {source.title}
          </div>
          <div className="source-modal__body">
            <p>
              Aperçu de la source citée. Dans une vraie intégration, on récupère ici
              Open Graph, oEmbed, ou un fragment de l'article via le service
              backend <code>KindSourceService</code>.
            </p>
            <p>
              L'URL d'origine reste accessible en un clic, mais le lecteur peut
              prendre connaissance du contexte sans quitter Kind — fidèle à la
              promesse "Sourced".
            </p>
          </div>
          <a
            href={source.url}
            className="source-modal__link"
            target="_blank"
            rel="noopener noreferrer"
          >
            {t('source.open')} ↗
          </a>
        </div>
      </div>
    </div>
  );
}
