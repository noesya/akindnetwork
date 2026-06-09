import { useEffect, useState } from 'react';
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

type Props = {
  letter: Letter | LetterWithReview;
  // Hide all interactive bottom actions (Contribuer, Approve/Reject). Used by
  // recursive renders where the parent already provides the contribute CTA.
  showActions?: boolean;
  // When true (the default at the root), render the letter's replies inline
  // below as a continuous reading flow. Recursive renders pass `false` so we
  // don't pull a child's grandchildren into the same page — visitors navigate
  // deeper by clicking a reply's title.
  renderReplies?: boolean;
  // Recursive children render in a slimmer style (compact title that links
  // to the dedicated /read/<id> page, so further descent is one click away).
  variant?: 'root' | 'reply';
};

/**
 * Renders a single Letter and, when at the root of the read flow, its replies
 * below as full inline content. The "Contribuer" CTA sits at the very bottom
 * of the whole flow (after all replies), not next to the root letter — so
 * the reader takes in the conversation first, then chooses to contribute.
 */
export default function LetterView({
  letter,
  showActions = true,
  renderReplies = true,
  variant = 'root'
}: Props) {
  const { t, i18n } = useTranslation();
  const { user: me } = useCurrentUser();
  const navigate = useNavigate();
  const notify = useNotify();
  const refresh = useRefresh();

  const reviewable = letter as LetterWithReview;
  const myWebId = me.webId;
  // Approve/reject buttons appear when the viewer is an assigned reviewer
  // who hasn't cast a ballot yet. The check mirrors useLetters' visibleToMe
  // filter — the two need to agree, else letters would show up without a
  // way to act on them (or vice versa).
  const canReview = Boolean(
    reviewable.status === 'in-review' &&
      myWebId &&
      reviewable.assignedReviewers?.includes(myWebId) &&
      !reviewable.approvedByWebIds?.includes(myWebId) &&
      !reviewable.rejectedByEntries?.some((r) => r.reviewer === myWebId)
  );

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

  const parentUri =
    reviewable.inReplyToUri && !letter.respondsTo ? reviewable.inReplyToUri : undefined;
  const { letter: parent } = useLetter(parentUri);

  // Children are fetched regardless of `renderReplies` so the reply variant
  // can still display its own descendant count in the "Répondre" button at
  // the bottom (e.g. "Répondre · 3 réponses" → click opens the reply on
  // /read/<id> with its full subtree). React-query dedupes the underlying
  // useGetList across all LetterView instances on the page, so it's still
  // a single network roundtrip even with several inline replies.
  const { children } = useChildren(letter.id);

  // Sticky author column compacts as the reader scrolls into the body.
  // Above the threshold (~40% of viewport height): full card with bio.
  // Below: small avatar + name only — keeps the byline visible while making
  // room for the text. Only applies to the root letter; replies are already
  // compact by design. No-op outside the browser (SSR safety).
  const [authorCompact, setAuthorCompact] = useState(false);
  useEffect(() => {
    if (variant !== 'root' || typeof window === 'undefined') return;
    const threshold = window.innerHeight * 0.4;
    const onScroll = () => setAuthorCompact(window.scrollY > threshold);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, [variant]);

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

  // Each LetterView gets its own "respond" handler scoped to its letter.
  // For root letters this is the Contribuer CTA at the bottom of the flow;
  // for replies it's the Répondre button under each reply card. Both open
  // /write pre-filled with this letter as `respondsTo`.
  //
  // The label we pass over in route state falls back to a truncated body
  // when the letter has no title (e.g. inline replies without a heading),
  // so the editor's "À propos?" sidebar always has something readable to
  // show instead of an empty quoted string.
  const respondLabel = (() => {
    const t = letter.title?.trim();
    if (t) return t;
    const body = letter.paragraphs.join(' ').trim();
    return body.length > 80 ? body.slice(0, 79) + '…' : body;
  })();
  const onRespond = () => {
    navigate('/write', {
      state: {
        respondsTo: { id: letter.id, title: respondLabel }
      }
    });
  };

  const sourceUrls = reviewable.sourceUrls ?? letter.sources.map((s: Source) => s.url);

  const articleClass = [
    'letter-view',
    variant === 'reply' && 'letter-view--reply',
    variant === 'root' && authorCompact && 'letter-view--author-compact'
  ]
    .filter(Boolean)
    .join(' ');

  // Replies have NO visible title — they sit under a parent whose title
  // already announces the subject. The reply's own date in the sidebar
  // doubles as a permalink to /read/<id> so the visitor can click through
  // to read its own children. Root letters of course still show their h1.
  const titleNode =
    variant === 'reply' ? null : <h1 className="letter-view__title">{letter.title}</h1>;

  return (
    <>
      <article className={articleClass}>
        <aside className="letter-view__author">
          {/* Avatar size collapses to md when scrolled (root) or for replies
            (always compact by design). The bio is hidden in both cases via
            CSS — the user wants replies to keep just photo + name. */}
          <Avatar
            user={author}
            size={variant === 'reply' || authorCompact ? 'md' : 'lg'}
          />
          <div className="letter-view__author-name">{author.name}</div>
          {variant === 'root' && (
            <div className="letter-view__author-bio">{author.bio}</div>
          )}
        </aside>

        <div className="letter-view__content">
          {titleNode}
          <div className="letter-view__body">
            {letter.paragraphs.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>

          {showActions && canReview && (
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

          {/* Reply-only actions row:
              - "Répondre à ce message" button — always shown. Opens /write
                pre-filled with this reply as respondsTo (truncated label).
              - "N réponses →" link — appears AFTER the button, only when
                the reply already has children. Opens /read/<id> so visitors
                can drill into the subtree from this reply onwards.
              Button first (the CTA), then the discreet counter. */}
          {variant === 'reply' && (
            <div className="letter-view__actions">
              <button className="btn" type="button" onClick={onRespond}>
                {t('letter.respond')}
              </button>
              {children.length > 0 && (
                <Link
                  to={`/read/${toSlug(letter.id)}`}
                  className="letter-view__replies-link"
                >
                  {t('letter.responses', { count: children.length })} →
                </Link>
              )}
            </div>
          )}
        </div>

        <aside className="letter-view__sidebar">
          <SidebarField label={t('letter.when')}>
            {formatDate(letter.publishedAt, i18n.language)}
          </SidebarField>

          {/* "About?" in the mockup = the parent letter this one is a reply
            to. Always displayed in the sidebar (root or reply), so the body
            text stays clean. Three sources of truth, in order:
              1. letter.respondsTo (rich object, used by mock data)
              2. parent (resolved from inReplyToUri via useLetter)
              3. raw URI fallback if neither resolved yet
          */}
          {/* "À propos ?" only shown on the root letter — replies all share
            the same parent (which is the root above), so repeating it on
            every reply card would be noise. */}
          {variant === 'root' && (letter.respondsTo || parent || reviewable.inReplyToUri) && (
            <SidebarField label={t('letter.about')}>
              {letter.respondsTo ? (
                <>
                  <Link to={`/read/${toSlug(letter.respondsTo.id)}`}>
                    « {letter.respondsTo.title} »
                  </Link>{' '}
                  <span className="muted">
                    {t('letter.byAuthor', {
                      name:
                        users[letter.respondsTo.authorId]?.name ??
                        letter.respondsTo.authorId
                    })}
                    , {formatDate(letter.respondsTo.publishedAt, i18n.language)}.
                  </span>
                </>
              ) : parent ? (
                <Link to={`/read/${toSlug(parent.id)}`}>« {parent.title} »</Link>
              ) : (
                <span className="muted">…</span>
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

      {renderReplies && children.length > 0 && (
        <section className="letter-view__replies">
          <h2 className="letter-view__replies-title">
            {t('letter.responses', { count: children.length })}
          </h2>
          {children.map((c) => (
            <LetterView
              key={c.id}
              letter={c}
              showActions={false}
              renderReplies={false}
              variant="reply"
            />
          ))}
        </section>
      )}

      {/* Contribuer sits AFTER the whole reading flow (letter + replies),
        making the conversation feel like one continuous read. Hidden when
        the viewer is voting on this letter (different action surface) or
        when this is a recursive reply render (only root contributes). */}
      {showActions && !canReview && variant === 'root' && (
        <div className="letter-view__contribute">
          <button className="btn" type="button" onClick={onRespond}>
            {t('letter.contribute')}
          </button>
        </div>
      )}
    </>
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
