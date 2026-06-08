import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCreate, useGetOne, useNotify, useUpdate } from 'ra-core';
import { useNavigate } from 'react-router-dom';
import type { Letter } from '../data/mock';
import { useCurrentUser } from '../hooks/useCurrentUser';
import SidebarField from './SidebarField';

const MAX_WORDS = 500;
const RESOURCE = 'Letter';

type Status = 'draft' | 'pending-review';

type Props = {
  respondsTo?: Letter['respondsTo'];
  // When the route is /write/:draftId the parent passes the id here so the
  // editor can fetch the existing record and update it on save instead of
  // creating a duplicate.
  draftId?: string;
};

/**
 * Editor for a single letter, persisted to the user's Pod as an as:Note
 * (shape tree https://shapes.activitypods.org/shapetrees/as/Note, registered
 * in providers/setup.ts as resource "Letter").
 *
 * Buttons:
 *   - Save Draft         → POST/PUT with kind:status="draft"
 *   - Send for review    → POST/PUT with kind:status="pending-review"
 *                          (peer-review distribution wiring comes later)
 *
 * After the first save, the URL is replaced with /write/<newId> so the
 * editor switches into update mode and refreshes are idempotent.
 */
export default function LetterEditor({ respondsTo, draftId: draftIdProp }: Props) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const notify = useNotify();
  const { user } = useCurrentUser();

  const [letterId, setLetterId] = useState<string | undefined>(draftIdProp);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [hydrated, setHydrated] = useState(false);

  // Fetch existing draft so /write/<id> shows the saved content. Skipped when
  // there's no id (i.e. user is creating a new letter).
  const { data: existing } = useGetOne<any>(
    RESOURCE,
    { id: letterId || '' },
    { enabled: !!letterId && !hydrated }
  );
  useEffect(() => {
    if (existing && !hydrated) {
      setTitle(String(existing.name || existing['as:name'] || ''));
      setBody(String(existing.content || existing['as:content'] || ''));
      setHydrated(true);
    }
  }, [existing, hydrated]);

  const [create, { isLoading: isCreating }] = useCreate();
  const [update, { isLoading: isUpdating }] = useUpdate();
  const isSaving = isCreating || isUpdating;

  const wordCount = body.trim().split(/\s+/).filter(Boolean).length;
  const wordsLeft = Math.max(0, MAX_WORDS - wordCount);
  const overLimit = wordCount > MAX_WORDS;
  const isEmpty = title.trim() === '' && body.trim() === '';

  const buildPayload = (status: Status) => {
    const data: Record<string, unknown> = {
      type: 'Note',
      name: title.trim(),
      content: body.trim(),
      'kind:status': status,
      'kind:language': i18n.language
    };
    if (respondsTo?.id) data.inReplyTo = respondsTo.id;
    return data;
  };

  const save = (status: Status, after?: () => void) => {
    const data = buildPayload(status);
    const onSuccess = (saved: any) => {
      if (status === 'draft') {
        notify('editor.savedDraft', { type: 'success' });
      } else {
        notify('editor.sentForReview', { type: 'success' });
      }
      const id = saved?.id ? String(saved.id) : letterId;
      if (id && !letterId) {
        setLetterId(id);
        // Replace so the browser back-button still goes to wherever the user
        // came from (rather than the empty /write).
        navigate(`/write/${encodeURIComponent(id)}`, { replace: true });
      }
      after?.();
    };
    const onError = (e: any) => {
      notify(e?.message || 'editor.saveFailed', { type: 'error' });
    };

    if (letterId) {
      update(
        RESOURCE,
        { id: letterId, data, previousData: existing || {} },
        { onSuccess, onError }
      );
    } else {
      create(RESOURCE, { data }, { onSuccess, onError });
    }
  };

  return (
    <div className="editor">
      <aside className="editor__meta">
        <SidebarField label={t('letter.by')}>{user.name}</SidebarField>
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
          <button
            className="btn"
            type="button"
            disabled={isEmpty || isSaving}
            onClick={() => save('draft')}
          >
            {isSaving ? t('editor.saving') : t('editor.saveDraft')}
          </button>
          <button
            className="btn"
            type="button"
            disabled={isEmpty || isSaving || overLimit}
            onClick={() => save('pending-review', () => navigate('/me'))}
          >
            {t('editor.sendForReview')}
          </button>
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
