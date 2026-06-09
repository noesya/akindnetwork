import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useCreate, useGetOne, useNotify, useUpdate } from 'ra-core';
import { useLocation, useNavigate } from 'react-router-dom';
import type { Letter } from '../data/mock';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { useLetter } from '../hooks/useLetters';
import { fromSlug, toSlug } from '../lib/letterSlug';
import { submitDraftForReview } from '../lib/peerReviewApi';
import Avatar from './Avatar';
import SidebarField from './SidebarField';

const MAX_WORDS = 500;
const RESOURCE = 'Letter';

type Props = {
  respondsTo?: Letter['respondsTo'];
  draftId?: string;
  // Rendered at the bottom of the center column, below the actions row.
  // WritePage uses this slot to surface the drafts + in-review lists so
  // they stay aligned with the text body above instead of becoming a
  // separate page region.
  children?: ReactNode;
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
export default function LetterEditor({
  respondsTo: respondsToProp,
  draftId: draftIdProp,
  children
}: Props) {
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
  // In demo mode there's no Pod to save to — the editor stays interactive
  // for the prototype experience, but write actions are blocked with a
  // tooltip that points the user at /login.
  const isDemo = user.isMock;

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

  // Status to display in the right sidebar. For new letters there's no
  // status yet — we fall back to "Brouillon" as the natural default. For
  // existing ones (Pod-side, kind:status) we map to the localized label.
  const existingStatus = existing?.['kind:status'] as
    | 'draft'
    | 'pending-review'
    | 'published'
    | 'rejected'
    | undefined;
  const statusLabel = (() => {
    switch (existingStatus) {
      case 'pending-review':
        return t('me.status.inReview');
      case 'published':
        return t('me.status.published');
      case 'rejected':
        return t('editor.statusRejected');
      default:
        return t('me.status.draft');
    }
  })();

  return (
    <div className="editor">
      {/* 3-column grid mirroring LetterView's reading layout:
            qui (left) | quoi (center) | meta (right)
          All three columns start at the same top edge — no title-only row.
          Center column stacks title, body, actions, then children. */}
      <aside className="editor__meta editor__meta--left">
        <Avatar user={user} size="lg" />
        <div className="editor__author-name">{user.name}</div>
        {user.bio && <div className="editor__author-bio">{user.bio}</div>}
      </aside>

      <div className="editor__main">
        {/* When writing a reply (respondsTo set), the editor hides the
          title field — a reply doesn't carry its own heading, the subject
          is the parent letter (shown in "À propos?" on the right). The
          save still posts `name: ''`, which is fine: the read view
          variant='reply' doesn't render a title either. */}
        {!respondsTo && (
          <>
            <div className="editor__label">{t('editor.title')}</div>
            <input
              className="editor__title-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('editor.title')}
            />
          </>
        )}

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
            disabled={isDemo || isEmpty || isSaving || submitting}
            onClick={saveDraft}
            title={isDemo ? t('demo.disabledHint') : undefined}
          >
            {isSaving ? t('editor.saving') : t('editor.saveDraft')}
          </button>
          <button
            className="btn"
            type="button"
            disabled={isDemo || isEmpty || isSaving || submitting || overLimit}
            onClick={sendForReview}
            title={isDemo ? t('demo.disabledHint') : undefined}
          >
            {submitting ? t('editor.submitting') : t('editor.sendForReview')}
          </button>
          <span className="editor__count">{t('editor.wordsLeft', { count: wordsLeft })}</span>
        </div>

        {/* Children slot — WritePage puts the drafts + in-review lists here
          so they sit directly under the text area, sharing the same width
          and visual column as the body. */}
        {children}
      </div>

      <aside className="editor__meta editor__meta--right">
        <SidebarField label={t('letter.when')}>
          {new Date().toLocaleDateString(i18n.language === 'fr' ? 'fr-FR' : 'en-GB', {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
          })}
        </SidebarField>
        {respondsTo && (
          <SidebarField label={t('letter.about')}>
            « {respondsTo.title || t('me.untitledDraft')} »
          </SidebarField>
        )}
        <SidebarField label={t('letter.status')}>{statusLabel}</SidebarField>
        <SidebarField label={t('letter.sources')}>
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
