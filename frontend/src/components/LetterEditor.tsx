import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Letter } from '../data/mock';
import { currentUser } from '../data/mock';
import SidebarField from './SidebarField';

const MAX_WORDS = 500;

export default function LetterEditor({ respondsTo }: { respondsTo?: Letter['respondsTo'] }) {
  const { t, i18n } = useTranslation();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');

  const wordCount = body.trim().split(/\s+/).filter(Boolean).length;
  const wordsLeft = Math.max(0, MAX_WORDS - wordCount);
  const isEmpty = title.trim() === '' && body.trim() === '';

  return (
    <div className="editor">
      <aside className="editor__meta">
        <SidebarField label={t('letter.by')}>{currentUser.name}</SidebarField>
        <SidebarField label={t('letter.writtenOn')}>
          {new Date().toLocaleDateString(i18n.language === 'fr' ? 'fr-FR' : 'en-GB', {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
          })}
        </SidebarField>
      </aside>

      <div className="editor__main">
        <div className="editor__label">{t('editor.title')}</div>
        <input
          className="editor__title-input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t('editor.title')}
        />

        <div className="editor__label">{t('editor.text')}</div>
        <textarea
          className="editor__body-input"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={12}
        />

        <div className="editor__actions">
          <button className="btn">{t('editor.saveDraft')}</button>
          <button className="btn">{t('editor.sendForReview')}</button>
          <span className="editor__count">{t('editor.wordsLeft', { count: wordsLeft })}</span>
        </div>
      </div>

      <aside className="editor__meta">
        {respondsTo && (
          <SidebarField label={t('letter.inResponseTo')}>
            « {respondsTo.title} »
          </SidebarField>
        )}
      </aside>
    </div>
  );
}
