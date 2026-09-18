"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { getCurrentProfile, getDiscussionMessages, getDiscussionReviews, postDiscussionMessage } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import type { AnnotationLabel, DiscussionMessage, DiscussionReview, Profile } from "@/lib/types";

type DiscussionFilter = "all" | "messages" | "disagreements";

const demoProfile: Profile = { id: "demo", display_name: "Annotator 1", role: "annotator" };
const demoReviews: DiscussionReview[] = [{
  id: 8,
  candidate_id: "REV-0081422",
  source_tier: "TIER_A_CONFIDENT",
  review_text: "Food was good pero kulang ang order and late kaayo niabot.",
  annotator_1_label: "complaint",
  annotator_2_label: "not_complaint",
  message_count: 2,
  last_message_at: "2026-09-18T14:06:00.000Z",
}];
const demoMessages: DiscussionMessage[] = [
  { id: 1, review_id: 8, author_id: "demo", author_name: "Annotator 1", author_role: "annotator", message: "I counted the missing item as a complaint even though the food was praised.", created_at: "2026-09-18T14:05:00.000Z" },
  { id: 2, review_id: 8, author_id: "demo-2", author_name: "Annotator 2", author_role: "annotator", message: "Agreed. The one-problem rule applies here.", created_at: "2026-09-18T14:06:00.000Z" },
];

export function DiscussionWorkspace() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(isSupabaseConfigured ? null : demoProfile);
  const [reviews, setReviews] = useState<DiscussionReview[]>(isSupabaseConfigured ? [] : demoReviews);
  const [selectedId, setSelectedId] = useState<number | null>(isSupabaseConfigured ? null : demoReviews[0].id);
  const [messages, setMessages] = useState<DiscussionMessage[]>(isSupabaseConfigured ? [] : demoMessages);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<DiscussionFilter>("all");
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const loadReviews = useCallback(async () => {
    const discussionReviews = await getDiscussionReviews();
    setReviews(discussionReviews);
    const requestedId = Number(new URLSearchParams(window.location.search).get("review"));
    setSelectedId((current) => {
      if (requestedId && discussionReviews.some((item) => item.id === requestedId)) return requestedId;
      if (current && discussionReviews.some((item) => item.id === current)) return current;
      return discussionReviews[0]?.id ?? null;
    });
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    void (async () => {
      try {
        const currentProfile = await getCurrentProfile();
        if (!currentProfile) return router.replace("/login");
        if (currentProfile.role !== "annotator" && currentProfile.role !== "admin") {
          return router.replace("/adjudicate");
        }
        setProfile(currentProfile);
        await loadReviews();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not load discussions.");
      } finally {
        setLoading(false);
      }
    })();
  }, [loadReviews, router]);

  const loadMessages = useCallback(async (reviewId: number, quietly = false) => {
    if (!quietly) setMessagesLoading(true);
    try {
      const discussionMessages = await getDiscussionMessages(reviewId);
      setMessages(discussionMessages);
    } catch (cause) {
      if (!quietly) setError(cause instanceof Error ? cause.message : "Could not load this discussion.");
    } finally {
      if (!quietly) setMessagesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured || !selectedId) return;
    const initialTimer = window.setTimeout(() => void loadMessages(selectedId), 0);
    const refreshTimer = window.setInterval(() => void loadMessages(selectedId, true), 12_000);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(refreshTimer);
    };
  }, [loadMessages, selectedId]);

  const visibleReviews = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return reviews.filter((review) => {
      if (filter === "messages" && Number(review.message_count) === 0) return false;
      if (filter === "disagreements" && review.annotator_1_label === review.annotator_2_label) return false;
      return !normalized || review.review_text.toLowerCase().includes(normalized) || review.candidate_id.toLowerCase().includes(normalized);
    });
  }, [filter, query, reviews]);

  const selected = reviews.find((review) => review.id === selectedId) ?? null;
  const meetingReviews = useMemo(() => selectMeetingReviews(reviews), [reviews]);

  function openMeetingReview(reviewId: number) {
    setFilter("all");
    setSelectedId(reviewId);
    window.setTimeout(() => document.getElementById("discussion-thread")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = draft.trim();
    if (!selected || !message || sending || profile?.role !== "annotator") return;
    setSending(true);
    setError("");
    try {
      const posted = isSupabaseConfigured
        ? await postDiscussionMessage(selected.id, message)
        : { id: -(messages.length + 1), review_id: selected.id, author_id: profile.id, author_name: profile.display_name, author_role: profile.role, message, created_at: new Date().toISOString() } as DiscussionMessage;
      setMessages((current) => [...current, posted]);
      setReviews((current) => current.map((item) => item.id === selected.id
        ? { ...item, message_count: Number(item.message_count) + 1, last_message_at: posted.created_at }
        : item));
      setDraft("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The message could not be posted.");
    } finally {
      setSending(false);
    }
  }

  if (loading || !profile) return <div className="center-state"><span className="spinner" />Loading discussions…</div>;

  return (
    <main className="app-shell discussions-page">
      <AppHeader name={profile.display_name} role={profile.role} />
      <section className="discussions-workspace">
        <div className="discussions-heading">
          <div><span className="eyebrow">TEAM SPACE</span><h1>Review discussions</h1><p>Discuss a review only after both primary labels are submitted.</p></div>
          <span className="count-pill">{reviews.length.toLocaleString()} ready</span>
        </div>
        {error && <div className="error-banner" role="alert">{error}</div>}

        <section className="meeting-agenda" aria-labelledby="meeting-agenda-title">
          <div className="meeting-agenda-heading">
            <div><span className="eyebrow">MEETING LIST</span><h2 id="meeting-agenda-title">Five reviews to discuss</h2></div>
            <p>Review these together in order. They prioritize disagreements and difficult agreed examples.</p>
          </div>
          <ol className="meeting-review-list">
            {meetingReviews.map((item) => (
              <li key={item.id}>
                <div>
                  <strong>{item.candidate_id}</strong>
                  <span>{item.review_text}</span>
                  <small>{item.annotator_1_label !== item.annotator_2_label ? "Disagreement" : `Agreed · ${labelName(item.annotator_1_label)}`}</small>
                </div>
                <button onClick={() => openMeetingReview(item.id)}>Open review</button>
              </li>
            ))}
          </ol>
          <p className="meeting-note">For each one, ask: “What exact words show a problem, and which written rule applies?” Keep the original labels unchanged; the third annotator still decides disagreements.</p>
        </section>

        <div className="discussion-layout" id="discussion-thread">
          <aside className="discussion-index" aria-label="Discussable reviews">
            <label className="discussion-search"><span className="sr-only">Search reviews</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search reviews…" /></label>
            <div className="discussion-filters" aria-label="Filter reviews">
              {(["all", "messages", "disagreements"] as DiscussionFilter[]).map((value) => (
                <button key={value} className={filter === value ? "is-active" : ""} onClick={() => setFilter(value)}>{discussionFilterName(value)}</button>
              ))}
            </div>
            <ol className="discussion-review-list">
              {visibleReviews.map((item) => (
                <li key={item.id}>
                  <button className={item.id === selectedId ? "is-selected" : ""} onClick={() => setSelectedId(item.id)}>
                    <span><strong>{item.candidate_id}</strong><small>{Number(item.message_count) ? `${Number(item.message_count)} message${Number(item.message_count) === 1 ? "" : "s"}` : "No messages"}</small></span>
                    <p>{item.review_text}</p>
                    {item.annotator_1_label !== item.annotator_2_label && <em>Disagreement</em>}
                  </button>
                </li>
              ))}
            </ol>
            {!visibleReviews.length && <div className="discussion-empty-small">No matching reviews.</div>}
          </aside>

          <section className="discussion-thread" aria-live="polite">
            {selected ? (
              <>
                <header className="discussion-review-card">
                  <div><span className="eyebrow">{selected.candidate_id}</span>{selected.annotator_1_label !== selected.annotator_2_label && <span className="discussion-status">Disagreement</span>}</div>
                  <blockquote>{selected.review_text}</blockquote>
                  <div className="discussion-labels">
                    <span>Annotator 1 <strong className={`label-chip ${selected.annotator_1_label}`}>{labelName(selected.annotator_1_label)}</strong></span>
                    <span>Annotator 2 <strong className={`label-chip ${selected.annotator_2_label}`}>{labelName(selected.annotator_2_label)}</strong></span>
                  </div>
                </header>

                <div className="discussion-messages">
                  {messagesLoading ? <div className="discussion-loading"><span className="spinner" />Loading messages…</div> : messages.length ? messages.map((message) => (
                    <article key={message.id} className={message.author_id === profile.id ? "is-mine" : ""}>
                      <header><strong>{message.author_id === profile.id ? "You" : message.author_name}</strong><time dateTime={message.created_at}>{formatMessageTime(message.created_at)}</time></header>
                      <p>{message.message}</p>
                    </article>
                  )) : <div className="discussion-empty"><strong>No discussion yet</strong><p>Ask about the rule or explain why this review was difficult.</p></div>}
                </div>

                {profile.role === "annotator" ? (
                  <form className="discussion-composer" onSubmit={(event) => void sendMessage(event)}>
                    <label><span className="sr-only">Message</span><textarea rows={3} maxLength={2000} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Write a message about this review…" /></label>
                    <div><small>{draft.length}/2000</small><button className="primary-button" disabled={!draft.trim() || sending}>{sending ? "Posting…" : "Post message"}</button></div>
                  </form>
                ) : <div className="discussion-read-only">Administrator view is read-only.</div>}
              </>
            ) : (
              <div className="discussion-empty"><strong>No reviews are ready yet</strong><p>A review will appear here after both annotators submit their labels.</p></div>
            )}
          </section>
        </div>
      </section>
    </main>
  );
}

function labelName(label: AnnotationLabel) {
  if (label === "complaint") return "Complaint";
  if (label === "not_complaint") return "Not complaint";
  return "Not Cebuano-English";
}

function discussionFilterName(filter: DiscussionFilter) {
  if (filter === "all") return "All";
  if (filter === "messages") return "Active";
  return "Disagreements";
}

function formatMessageTime(value: string) {
  return new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila" }).format(new Date(value));
}

function selectMeetingReviews(reviews: DiscussionReview[]) {
  const picked: DiscussionReview[] = [];
  const add = (review: DiscussionReview | undefined) => {
    if (review && !picked.some((item) => item.id === review.id)) picked.push(review);
  };
  const ranked = [...reviews].sort((a, b) => difficultyScore(b) - difficultyScore(a) || a.id - b.id);

  ranked
    .filter((item) => item.annotator_1_label !== item.annotator_2_label)
    .slice(0, 3)
    .forEach(add);

  (["complaint", "not_complaint", "not_cebuano_english"] as AnnotationLabel[]).forEach((label) => {
    if (picked.length < 5) add(ranked.find((item) => item.annotator_1_label === label && item.annotator_2_label === label));
  });

  ranked.forEach((item) => {
    if (picked.length < 5) add(item);
  });

  return picked.slice(0, 5);
}

function difficultyScore(review: DiscussionReview) {
  const cues = review.review_text.match(/\b(pero|but|although|unta|lang|price|mahal|afford|cancel(?:led)?|expiry|expired|late|dugay|kulang|gamay|cold|init|rider|delivery|another|other|store)\b/gi)?.length ?? 0;
  const disagreement = review.annotator_1_label !== review.annotator_2_label ? 100 : 0;
  const activeDiscussion = Number(review.message_count) > 0 ? 10 : 0;
  return disagreement + activeDiscussion + cues;
}
