import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCreate, useGetOne, useNotify, useUpdate } from 'ra-core';
import { useLocation, useNavigate } from 'react-router-dom';
import type { Letter } from '../data/mock';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { useLetter } from '../hooks/useLetters';
import { fromSlug, toSlug } from '../lib/letterSlug';
import { submitDraftForReview } from '../lib/peerReviewApi';
import SidebarField from './SidebarField';

const MAX_WORDS = 500;
const RESOURCE = 'Letter';

type Props = {
  // Optional inline override of the "in response to" target (used by the
  // mock demo). Production replies come in via `location.state.respondsTo`,
  // set by LetterView's "Respond" button when the user opens /write from a
  // letter they want to reply to.
  respondsTo?: Letter['respondsTo'];
  // When the route is /write/:draftId the parent passes the slug down — it's
  // the last path segment of the Letter's Solid URI (eg. a UUID). We rebuild
  // the full URI before talking to the dataProvider.
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
export default function LetterEditor({ respondsTo: respondsToProp, draftId: draftIdProp }: Props) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const notify = useNotify();
  const location = useLocation();
  const { user } = useCurrentUser();

  // Resolve the slug (from the URL param) to a full Solid URI. We can only do
  // this once we know the user's `pim:storage`; until then `useGetOne` stays
  // disabled (see `enabled` below).
  const letterUri = useMemo(
    () => (draftIdProp ? fromSlug(draftIdProp, user.storage) : undefined),
    [draftIdProp, user.storage]
  );
  const [letterId, setLetterId] = useState<string | undefined>(letterUri);
  useEffect(() => {
    if (letterUri) setLetterId(letterUri);
  }, [letterUri]);

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [sourcesText, setSourcesText] = useState('');
  const [hydrated, setHydrated] = useState(false);

  // Fetch existing draft so /write/<slug> shows the saved content. Skipped
  // when there's no id, or when the URI couldn't be resolved yet (we'd
  // otherwise fire a fetch on the bare slug and get a 404).
  const canFetch = !!letterId && letterId.startsWith('http') && !hydrated;
  const { data: existing } = useGetOne<any>(
    RESOURCE,
    { id: letterId || '' },
    { enabled: canFetch }
  );
  useEffect(() => {
    if (existing && !hydrated) {
      setTitle(String(existing.name || existing['as:name'] || ''));
      setBody(String(existing.content || existing['as:content'] || ''));
      // sources can deserialize as a single string OR an array
      const rawSources = existing['kind:sources'];
      const sources = Array.isArray(rawSources)
        ? rawSources
        : rawSources
        ? [rawSources]
        : [];
      setSourcesText(sources.join('\n'));
      setHydrated(true);
    }
  }, [existing, hydrated]);

  // "Reply to" comes from one of three places, in order:
  //   1. props.respondsTo (mock demo path)
  //   2. existing letter's `as:inReplyTo` (we're editing a draft that was
  //      originally written as a reply)
  //   3. location.state.respondsTo (just arrived from clicking "Respond" on
  //      a LetterView)
  const navStateRespond =
    (location.state as { respondsTo?: { id: string; title: string } } | null)?.respondsTo;
  const existingInReplyToUri = existing?.inReplyTo as string | undefined;
  const { letter: existingParent } = useLetter(existingInReplyToUri);
  const respondsTo:
    | { id: string; title: string; authorId?: string; publishedAt?: string }
    | undefined =
    respondsToProp ||
    (existingParent
      ? { id: existingParent.id, title: existingParent.title }
      : undefined) ||
    navStateRespond ||
    undefined;

  const [create, { isLoading: isCreating }] = useCreate();
  const [update, { isLoading: isUpdating }] = useUpdate();
  const isSaving = isCreating || isUpdating;

  const wordCount = body.trim().split(/\s+/).filter(Boolean).length;
  const wordsLeft = Math.max(0, MAX_WORDS - wordCount);
  const overLimit = wordCount > MAX_WORDS;
  const isEmpty = title.trim() === '' && body.trim() === '';

  // Build the resource payload for a save. The status is always written by
  // the FRONTEND for drafts; for "submit for review" the frontend saves as
  // draft first and then the BACKEND flips the status (and assigns reviewers).
  const buildDraftPayload = () => {
    const sources = sourcesText
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && /^https?:\/\//.test(s));
    const data: Record<string, unknown> = {
      type: 'Note',
      name: title.trim(),
      content: body.trim(),
      'kind:status': 'draft',
      'kind:language': i18n.language,
      'kind:sources': sources
    };
    if (respondsTo?.id) data.inReplyTo = respondsTo.id;
    return data;
  };

  const persistDraft = (): Promise<string> =>
    new Promise((resolve, reject) => {
      const data = buildDraftPayload();
      const onSuccess = (saved: any) => {
        const id = saved?.id ? String(saved.id) : letterId;
        if (!id) return reject(new Error('No id returned from save'));
        if (!letterId) {
          setLetterId(id);
          navigate(`/write/${toSlug(id)}`, { replace: true });
        }
        resolve(id);
      };
      const onError = (e: any) => reject(new Error(e?.message || 'editor.saveFailed'));

      if (letterId) {
        update(
          RESOURCE,
          { id: letterId, data, previousData: existing || {} },
          { onSuccess, onError }
        );
      } else {
        create(RESOURCE, { data }, { onSuccess, onError });
      }
    });

  const saveDraft = async () => {
    try {
      await persistDraft();
      notify('editor.savedDraft', { type: 'success' });
    } catch (e: any) {
      notify(e?.message || 'editor.saveFailed', { type: 'error' });
    }
  };

  const [submitting, setSubmitting] = useState(false);
  const sendForReview = async () => {
    setSubmitting(true);
    try {
      const id = await persistDraft();
      await submitDraftForReview(id);
      notify('editor.sentForReview', { type: 'success' });
      // Back to the writing workspace — the letter we just submitted will
      // appear in the "En relecture" column right under the (now blank)
      // editor, so the user sees the state transition without leaving the
      // page. Going to /me used to make sense when drafts lived there.
      navigate('/write');
    } catch (e: any) {
      notify(e?.message || 'editor.submitFailed', { type: 'error' });
    } finally {
      setSubmitting(false);
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
            disabled={isEmpty || isSaving || submitting}
            onClick={saveDraft}
          >
            {isSaving ? t('editor.saving') : t('editor.saveDraft')}
          </button>
          <button
            className="btn"
            type="button"
            disabled={isEmpty || isSaving || submitting || overLimit}
            onClick={sendForReview}
          >
            {submitting ? t('editor.submitting') : t('editor.sendForReview')}
          </button>
          <span className="editor__count">{t('editor.wordsLeft', { count: wordsLeft })}</span>
        </div>
      </div>

      <aside className="editor__meta">
        {respondsTo && (
          <SidebarField label={t('letter.inResponseTo')}>
            « {respondsTo.title || t('me.untitledDraft')} »
          </SidebarField>
        )}
        <SidebarField label={t('editor.sources')}>
          <textarea
            className="editor__sources-input"
            value={sourcesText}
            onChange={(e) => setSourcesText(e.target.value)}
            rows={4}
            placeholder={t('editor.sourcesPlaceholder')}
          />
        </SidebarField>
      </aside>
    </div>
  );
}
