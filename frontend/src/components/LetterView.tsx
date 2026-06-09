import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNotify, useRefresh } from 'ra-core';
import { Link, useNavigate } from 'react-router-dom';
import type { Letter, Source, User } from '../data/mock';
import { users } from '../data/mock';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { useChildren, useLetter, type LetterWithReview } from '../hooks/useLetters';
import { toSlug } from '../lib/letterSlug';
import { approveLetter, rejectLetter } from '../lib/peerReviewApi';
import Avatar from './Avatar';
import SidebarField from './SidebarField';

export default function LetterView({
  letter,
  showActions = true
}: {
  letter: Letter | LetterWithReview;
  showActions?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const { user: me } = useCurrentUser();
  const navigate = useNavigate();
  const notify = useNotify();
  const refresh = useRefresh();

  const reviewable = letter as LetterWithReview;
  const myWebId = me.webId;
  // Approve/reject buttons appear when the viewer is an assigned reviewer
  // who hasn't cast a ballot yet. The check mirrors the same predicate in
  // useLetters' visibleToMe filter — the two need to agree, else letters
  // would show up without a way to act on them (or vice versa).
  const canReview = Boolean(
    reviewable.status === 'in-review' &&
      myWebId &&
      reviewable.assignedReviewers?.includes(myWebId) &&
      !reviewable.approvedByWebIds?.includes(myWebId) &&
      !reviewable.rejectedByEntries?.some((r) => r.reviewer === myWebId)
  );

  // Letters fetched from a Pod carry the WebID-derived authorId (e.g.
  // "arnaudlevy") which won't be in the mock `users` map. Cascade to the
  // current user when it's a self-letter, then to a minimal stub so the
  // sidebar still renders something usable.
  const author: User =
    users[letter.authorId] ||
    (letter.authorId === me.id ? me : null) ||
    {
      id: letter.authorId,
      webId: '',
      name: letter.authorId,
      bio: '',
      avatarInitials: '?',
      avatarColor: '#314a62'
    };

  // Resolve the parent letter (`as:inReplyTo`) so we can display its title
  // in the "in response to" header. Skipped when we already have the rich
  // mock shape (`letter.respondsTo` object) — that's used by the demo.
  const parentUri =
    reviewable.inReplyToUri && !letter.respondsTo ? reviewable.inReplyToUri : undefined;
  const { letter: parent } = useLetter(parentUri);

  // Children: letters that reference THIS letter via inReplyTo. Sorted
  // chronologically by the hook itself.
  const { children } = useChildren(letter.id);

  const [voting, setVoting] = useState(false);
  const onApprove = async () => {
    setVoting(true);
    try {
      const result = await approveLetter(letter.id);
      notify(
        result.status === 'published'
          ? 'review.notifyPublished'
          : 'review.notifyVoteRecorded',
        { type: 'success' }
      );
      refresh();
      navigate('/read');
    } catch (e: any) {
      notify(e?.message || 'review.failed', { type: 'error' });
    } finally {
      setVoting(false);
    }
  };
  const onReject = async () => {
    const comment = window.prompt(t('review.rejectPrompt'));
    if (!comment || comment.trim() === '') return;
    setVoting(true);
    try {
      const result = await rejectLetter(letter.id, comment.trim());
      notify(
        result.status === 'draft'
          ? 'review.notifyRejected'
          : 'review.notifyVoteRecorded',
        { type: 'success' }
      );
      refresh();
      navigate('/read');
    } catch (e: any) {
      notify(e?.message || 'review.failed', { type: 'error' });
    } finally {
      setVoting(false);
    }
  };

  // "Respond" routes to /write with state carrying the parent letter so the
  // editor can pre-fill its respondsTo sidebar and stamp `as:inReplyTo` on
  // save. We pass title + id (not the whole letter) — that's what the
  // editor needs and it keeps the route state small.
  const onRespond = () => {
    navigate('/write', {
      state: {
        respondsTo: { id: letter.id, title: letter.title }
      }
    });
  };

  // Sources: support both the rich mock Source[] (id/url/title) and the
  // Pod-only flat string[] surfaced by useLetters as sourceUrls. We never
  // open the SourceModal anymore — it relied on OG metadata that we
  // intentionally don't fetch (Kind sources are just URLs, by decision).
  const sourceUrls = reviewable.sourceUrls ?? letter.sources.map((s: Source) => s.url);

  return (
    <article className="letter-view">
      <aside className="letter-view__author">
        <Avatar user={author} size="lg" />
        <div className="letter-view__author-name">{author.name}</div>
        <div className="letter-view__author-bio">{author.bio}</div>
      </aside>

      <div className="letter-view__content">
        {(letter.respondsTo || parent) && (
          <div className="letter-view__respond-header">
            <span className="muted">{t('letter.inResponseTo')}</span>
            <br />
            {letter.respondsTo ? (
              <>
                <Link to={`/read/${toSlug(letter.respondsTo.id)}`}>
                  « {letter.respondsTo.title} »
                </Link>{' '}
                <span className="muted">
                  {t('letter.byAuthor', {
                    name:
                      users[letter.respondsTo.authorId]?.name ?? letter.respondsTo.authorId
                  })}
                  , {formatDate(letter.respondsTo.publishedAt, i18n.language)}.
                </span>
              </>
            ) : parent ? (
              <Link to={`/read/${toSlug(parent.id)}`}>« {parent.title} »</Link>
            ) : null}
          </div>
        )}

        <h1 className="letter-view__title">{letter.title}</h1>
        <div className="letter-view__body">
          {letter.paragraphs.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>

        {showActions && !canReview && (
          <div className="letter-view__actions">
            <button className="btn" type="button" onClick={onRespond}>
              {t('letter.respondPublicly')}
            </button>
          </div>
        )}

        {canReview && (
          <div className="letter-view__actions letter-view__actions--review">
            <div className="letter-view__review-prompt">{t('review.prompt')}</div>
            <button className="btn" type="button" onClick={onApprove} disabled={voting}>
              {t('review.approve')}
            </button>
            <button
              className="btn btn--ghost"
              type="button"
              onClick={onReject}
              disabled={voting}
            >
              {t('review.reject')}
            </button>
          </div>
        )}

        {children.length > 0 && (
          <section className="letter-view__children">
            <h2 className="letter-view__children-title">
              {t('letter.responses', { count: children.length })}
            </h2>
            {children.map((c) => (
              <Link
                key={c.id}
                to={`/read/${toSlug(c.id)}`}
                className="letter-view__child"
              >
                <span className="letter-view__child-title">{c.title}</span>
                <span className="letter-view__child-meta">
                  {formatDate(c.publishedAt, i18n.language)}
                </span>
              </Link>
            ))}
          </section>
        )}
      </div>

      <aside className="letter-view__sidebar">
        <SidebarField label={t('letter.when')}>
          {formatDate(letter.publishedAt, i18n.language)}
        </SidebarField>
        {letter.about && (
          <SidebarField label={t('letter.about')}>
            <a href="#" onClick={(e) => e.preventDefault()}>
              « {letter.about.title} »
            </a>
            {letter.about.author && (
              <> {t('letter.byAuthor', { name: letter.about.author })}</>
            )}
          </SidebarField>
        )}
        {letter.approvedBy.length > 0 && (
          <SidebarField label={t('letter.approvedBy')}>
            {letter.approvedBy.map((id, i) => (
              <span key={id}>
                <a href="#" onClick={(e) => e.preventDefault()}>
                  {users[id]?.name ?? id}
                </a>
                {i < letter.approvedBy.length - 1 ? ' & ' : ''}
              </span>
            ))}
          </SidebarField>
        )}
        {sourceUrls.length > 0 && (
          <SidebarField label={t('letter.sources')}>
            {sourceUrls.map((url) => (
              <div key={url} style={{ marginBottom: 'var(--space-2)' }}>
                <a href={url} target="_blank" rel="noopener noreferrer">
                  {truncate(url, 48)}
                </a>
              </div>
            ))}
          </SidebarField>
        )}
      </aside>
    </article>
  );
}

function formatDate(iso: string, lang: string) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}
