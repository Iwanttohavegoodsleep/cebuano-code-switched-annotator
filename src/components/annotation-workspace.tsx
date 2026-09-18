"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { AnnotationGuide } from "@/components/annotation-guide";
import { demoRecentAnnotations, demoReviews } from "@/lib/demo-data";
import { getCurrentProfile, getNextReview, getProgress, getRecentAnnotations, getWorkflowStatus, saveAnnotation, saveAnnotationAndGetNext, skipReviewAndGetNext, undoAnnotation } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { defaultAnnotationKeybinds, displayKey, isValidKeybinds, keybindLabels, keybindStorageKey, type AnnotationKeybinds } from "@/lib/keybinds";
import type { AnnotationLabel, Profile, Progress, RecentAnnotation, Review } from "@/lib/types";

type HistoryItem = { review: Review; progress: Progress; label: AnnotationLabel };

const demoProfile: Profile = { id: "demo", display_name: "Annotator 1", role: "annotator" };

export function AnnotationWorkspace() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(isSupabaseConfigured ? null : demoProfile);
  const [review, setReview] = useState<Review | null>(isSupabaseConfigured ? null : demoReviews[0]);
  const [demoIndex, setDemoIndex] = useState(0);
  const [progress, setProgress] = useState<Progress>({ total: isSupabaseConfigured ? 0 : 3566, completed: isSupabaseConfigured ? 0 : 481, skipped: 0 });
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [recent, setRecent] = useState<RecentAnnotation[]>(isSupabaseConfigured ? [] : demoRecentAnnotations);
  const [selectedRecent, setSelectedRecent] = useState<RecentAnnotation | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const [guidelinesOpen, setGuidelinesOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [keybinds, setKeybinds] = useState<AnnotationKeybinds>(defaultAnnotationKeybinds);
  const [keybindDraft, setKeybindDraft] = useState<AnnotationKeybinds>(defaultAnnotationKeybinds);
  const [keybindError, setKeybindError] = useState("");
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [error, setError] = useState("");
  const [annotationsLocked, setAnnotationsLocked] = useState(false);
  const busy = useRef(false);

  const loadRealWorkspace = useCallback(async () => {
    setLoading(true);
    try {
      const currentProfile = await getCurrentProfile();
      if (!currentProfile) {
        router.replace("/login");
        return;
      }
      if (currentProfile.role === "adjudicator") {
        router.replace("/adjudicate");
        return;
      }
      if (currentProfile.role === "admin") {
        router.replace("/admin");
        return;
      }
      const [nextReview, currentProgress, recentAnnotations, workflow] = await Promise.all([
        getNextReview(),
        getProgress(),
        getRecentAnnotations(100),
        getWorkflowStatus(),
      ]);
      setProfile(currentProfile);
      setReview(nextReview);
      setProgress(currentProgress);
      setRecent(recentAnnotations);
      setAnnotationsLocked(workflow.annotations_locked);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load the annotation queue.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (isSupabaseConfigured) void loadRealWorkspace();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadRealWorkspace]);

  useEffect(() => {
    if (!profile) return;
    const timer = window.setTimeout(() => {
      try {
        const stored = window.localStorage.getItem(keybindStorageKey(profile.id));
        if (!stored) return;
        const parsed: unknown = JSON.parse(stored);
        if (isValidKeybinds(parsed)) {
          setKeybinds(parsed);
          setKeybindDraft(parsed);
        }
      } catch {
        // Keep the defaults if local shortcut settings are unavailable or invalid.
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [profile]);

  const loadNext = useCallback(async () => {
    if (isSupabaseConfigured) {
      setReview(await getNextReview());
      return;
    }
    const next = demoIndex + 1;
    setDemoIndex(next);
    setReview(demoReviews[next % demoReviews.length]);
  }, [demoIndex]);

  const showSaved = useCallback(() => {
    setSaved(true);
    window.setTimeout(() => setSaved(false), 900);
  }, []);

  const putRecentFirst = useCallback((item: RecentAnnotation) => {
    setRecent((items) => [item, ...items.filter((entry) => entry.id !== item.id)].slice(0, 100));
  }, []);

  const complete = useCallback(async (label: AnnotationLabel) => {
    if (!review || busy.current) return;
    if (annotationsLocked) {
      setError("Primary labels are locked because adjudication has begun.");
      return;
    }
    busy.current = true;
    setError("");
    const previousProgress = progress;
    try {
      const nextReview = isSupabaseConfigured
        ? await saveAnnotationAndGetNext(review.id, label)
        : null;
      setHistory((items) => [...items.slice(-9), { review, progress: previousProgress, label }]);
      putRecentFirst({ ...review, label, updated_at: new Date().toISOString() });
      setProgress((value) => ({ ...value, completed: value.completed + 1 }));
      if (isSupabaseConfigured) setReview(nextReview);
      else await loadNext();
      showSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The answer could not be saved.");
    } finally {
      busy.current = false;
    }
  }, [annotationsLocked, loadNext, progress, putRecentFirst, review, showSaved]);

  const answerYes = useCallback(() => void complete("complaint"), [complete]);
  const answerNo = useCallback(() => void complete("not_complaint"), [complete]);
  const answerWrongLanguage = useCallback(() => void complete("not_cebuano_english"), [complete]);

  const editRecent = useCallback(async (label: AnnotationLabel) => {
    if (!selectedRecent || busy.current) return;
    if (annotationsLocked) {
      setError("Primary labels are locked because adjudication has begun.");
      return;
    }
    busy.current = true;
    setError("");
    try {
      await saveAnnotation(selectedRecent.id, label);
      const updated = { ...selectedRecent, label, updated_at: new Date().toISOString() };
      putRecentFirst(updated);
      setSelectedRecent(updated);
      showSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The earlier label could not be changed.");
    } finally {
      busy.current = false;
    }
  }, [annotationsLocked, putRecentFirst, selectedRecent, showSaved]);

  const skip = useCallback(async () => {
    if (!review || busy.current) return;
    busy.current = true;
    try {
      const nextReview = isSupabaseConfigured
        ? await skipReviewAndGetNext(review.id)
        : null;
      setProgress((value) => ({ ...value, skipped: value.skipped + 1 }));
      if (isSupabaseConfigured) setReview(nextReview);
      else await loadNext();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The review could not be skipped.");
    } finally {
      busy.current = false;
    }
  }, [loadNext, review]);

  const undo = useCallback(async () => {
    const previous = history.at(-1);
    if (!previous || busy.current) return;
    if (annotationsLocked) {
      setError("Primary labels are locked because adjudication has begun.");
      return;
    }
    busy.current = true;
    try {
      await undoAnnotation(previous.review.id);
      setReview(previous.review);
      setProgress(previous.progress);
      setHistory((items) => items.slice(0, -1));
      setRecent((items) => items.filter((item) => item.id !== previous.review.id));
      if (selectedRecent?.id === previous.review.id) setSelectedRecent(null);
      setSaved(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The previous answer could not be restored.");
    } finally {
      busy.current = false;
    }
  }, [annotationsLocked, history, selectedRecent]);

  const openShortcutSettings = useCallback(() => {
    setKeybindDraft(keybinds);
    setKeybindError("");
    setShortcutsOpen(true);
  }, [keybinds]);

  const saveShortcutSettings = useCallback(() => {
    if (!profile) return;
    const values = Object.values(keybindDraft);
    if (values.some((value) => !/^[a-z0-9]$/.test(value))) {
      setKeybindError("Use one letter or number for each shortcut.");
      return;
    }
    if (new Set(values).size !== values.length) {
      setKeybindError("Each action needs a different key.");
      return;
    }
    setKeybinds(keybindDraft);
    window.localStorage.setItem(keybindStorageKey(profile.id), JSON.stringify(keybindDraft));
    setShortcutsOpen(false);
  }, [keybindDraft, profile]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || guidelinesOpen || shortcutsOpen || loading) return;
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      const key = event.key.toLowerCase();
      if (key === keybinds.complaint) answerYes();
      if (key === keybinds.notComplaint) answerNo();
      if (key === keybinds.wrongLanguage) answerWrongLanguage();
      if (key === keybinds.skip) void skip();
      if (key === keybinds.undo) void undo();
      if (key === keybinds.history) setHistoryOpen((value) => !value);
      if (key === "?") setGuidelinesOpen(true);
      if (key === "escape") {
        setHistoryOpen(false);
        setSelectedRecent(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [answerNo, answerWrongLanguage, answerYes, guidelinesOpen, keybinds, loading, shortcutsOpen, skip, undo]);

  const percentage = progress.total ? Math.round((progress.completed / progress.total) * 100) : 0;

  if (loading || !profile) return <div className="center-state"><span className="spinner" />Loading your queue…</div>;

  return (
    <main className="app-shell annotation-app">
      <AppHeader name={profile.display_name} role={profile.role} />
      <div className="annotation-layout">
        <section className="workspace" aria-live="polite">
          <div className="queue-toolbar">
            <div>
              <span className="eyebrow">ANNOTATION QUEUE</span>
              <h1>Task {Math.min(progress.completed + 1, progress.total).toLocaleString()} <span>/ {progress.total.toLocaleString()}</span></h1>
            </div>
            <div className={`save-status ${saved ? "is-visible" : ""}`}><span aria-hidden="true">✓</span> Saved</div>
          </div>
          <div className="compact-progress">
            <div className="progress-track" aria-label={`${percentage}% complete`}><span style={{ width: `${percentage}%` }} /></div>
            <span>{percentage}%</span>
            <small>{Math.max(0, progress.total - progress.completed).toLocaleString()} left</small>
          </div>

          {error && <div className="error-banner" role="alert">{error}</div>}
          {annotationsLocked && <div className="error-banner" role="status">Primary annotation is complete and locked while the third reviewer adjudicates disagreements. You can still view your labels and discussions.</div>}

          {review ? (
            <div className="labeling-canvas">
              <article className="review-card">
                <div className="review-label"><span>REVIEW</span><small>{review.candidate_id}</small></div>
                <blockquote>{review.review_text}</blockquote>
              </article>
              <section className="decision-panel">
                <div className="decision-heading">
                  <div><span className="step-name">SELECT ONE</span><h2>Is this a complaint?</h2></div>
                  <button className="text-button" onClick={() => setGuidelinesOpen(true)}>View guidelines</button>
                </div>
                <div className="answer-grid">
                  <button className="answer-button answer-yes" onClick={answerYes} disabled={annotationsLocked}><kbd>{displayKey(keybinds.complaint)}</kbd><span><strong>Yes</strong><small>Complaint</small></span></button>
                  <button className="answer-button answer-no" onClick={answerNo} disabled={annotationsLocked}><kbd>{displayKey(keybinds.notComplaint)}</kbd><span><strong>No</strong><small>Not a complaint</small></span></button>
                  <button className="answer-button answer-language" onClick={answerWrongLanguage} disabled={annotationsLocked}><kbd>{displayKey(keybinds.wrongLanguage)}</kbd><span><strong>Not Cebuano-English</strong><small>Wrong language or not genuinely code-switched</small></span></button>
                </div>
              </section>
              <footer className="action-row">
                <button onClick={() => void undo()} disabled={!history.length || annotationsLocked}><kbd>{displayKey(keybinds.undo)}</kbd> Undo</button>
                <button onClick={() => void skip()}><kbd>{displayKey(keybinds.skip)}</kbd> Skip</button>
                <button className="history-toggle" onClick={() => setHistoryOpen(true)}><kbd>{displayKey(keybinds.history)}</kbd> History</button>
                <button onClick={openShortcutSettings}>Shortcuts</button>
                <span className="desktop-hint"><kbd>{displayKey(keybinds.complaint)}</kbd><kbd>{displayKey(keybinds.notComplaint)}</kbd><kbd>{displayKey(keybinds.wrongLanguage)}</kbd> to label</span>
              </footer>
            </div>
          ) : (
            <section className="empty-card"><span className="complete-mark">✓</span><h2>Queue complete</h2><p>You have annotated every available review.</p></section>
          )}
        </section>

        <aside className={`history-sidebar ${historyOpen ? "is-open" : ""}`} aria-label="Recent annotations">
          <div className="history-header">
            <div><span className="eyebrow">YOUR WORK</span><h2>{selectedRecent ? "Check label" : "Recent labels"}</h2></div>
            <button className="history-close" aria-label="Close history" onClick={() => { setHistoryOpen(false); setSelectedRecent(null); }}>×</button>
          </div>

          {!selectedRecent && <Link className="view-all-labels" href="/labels">View all your labels →</Link>}

          {selectedRecent ? (
            <div className="history-editor">
              <button className="history-back" onClick={() => setSelectedRecent(null)}>← Back to recent labels</button>
              <p>{selectedRecent.review_text}</p>
              <span className={`label-chip ${selectedRecent.label}`}>{labelName(selectedRecent.label)}</span>
              {annotationsLocked ? (
                <p className="modal-note">This label is read-only because adjudication has begun.</p>
              ) : (
                <div className="history-edit-buttons" aria-label="Change this label">
                  <p>Change label</p>
                  <button className={selectedRecent.label === "complaint" ? "is-selected" : ""} onClick={() => void editRecent("complaint")}>Yes · Complaint</button>
                  <button className={selectedRecent.label === "not_complaint" ? "is-selected" : ""} onClick={() => void editRecent("not_complaint")}>No · Not complaint</button>
                  <button className={selectedRecent.label === "not_cebuano_english" ? "is-selected" : ""} onClick={() => void editRecent("not_cebuano_english")}>Not Cebuano-English</button>
                </div>
              )}
            </div>
          ) : recent.length ? (
            <ol className="history-list">
              {recent.map((item, index) => (
                <li key={item.id}>
                  <button onClick={() => setSelectedRecent(item)}>
                    <span className="history-number" aria-label={`Review ${item.annotation_number ?? Math.max(1, progress.completed - index)}`}>
                      Review {(item.annotation_number ?? Math.max(1, progress.completed - index)).toLocaleString()}
                    </span>
                    <span className="history-item-content">
                      <span className={`label-chip ${item.label}`}>{labelName(item.label)}</span>
                      <span className="history-review-text">{item.review_text}</span>
                      <small>{annotationsLocked ? "Click to check" : "Click to check or change"}</small>
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          ) : (
            <div className="history-empty"><p>Your recent labels will appear here.</p></div>
          )}
        </aside>
      </div>

      {historyOpen && <button className="history-backdrop" aria-label="Close history" onClick={() => setHistoryOpen(false)} />}

      {guidelinesOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setGuidelinesOpen(false)}>
          <section className="modal guide-modal" role="dialog" aria-modal="true" aria-labelledby="guide-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" aria-label="Close guidelines" onClick={() => setGuidelinesOpen(false)}>×</button>
            <span className="eyebrow">QUICK REFERENCE</span><h2 id="guide-title">Annotation guidelines</h2>
            <AnnotationGuide compact />
            <p className="modal-note">Press <kbd>{displayKey(keybinds.complaint)}</kbd>, <kbd>{displayKey(keybinds.notComplaint)}</kbd>, or <kbd>{displayKey(keybinds.wrongLanguage)}</kbd> to label without using the mouse. Press <kbd>{displayKey(keybinds.skip)}</kbd> to return to a difficult review later.</p>
          </section>
        </div>
      )}

      {shortcutsOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setShortcutsOpen(false)}>
          <section className="modal shortcut-modal" role="dialog" aria-modal="true" aria-labelledby="shortcut-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" aria-label="Close shortcut settings" onClick={() => setShortcutsOpen(false)}>×</button>
            <span className="eyebrow">PREFERENCES</span><h2 id="shortcut-title">Keyboard shortcuts</h2>
            <p className="shortcut-intro">Choose one different key for each action. These settings are saved on this device.</p>
            <div className="shortcut-fields">
              {keybindLabels.map(({ key, label }) => (
                <label key={key}><span>{label}</span><input aria-label={`${label} shortcut`} maxLength={1} value={keybindDraft[key]} onChange={(event) => { const value = event.target.value.slice(-1).toLowerCase(); setKeybindDraft((current) => ({ ...current, [key]: value })); setKeybindError(""); }} onFocus={(event) => event.currentTarget.select()} /></label>
              ))}
            </div>
            {keybindError && <div className="shortcut-error" role="alert">{keybindError}</div>}
            <div className="shortcut-actions">
              <button className="secondary-button" onClick={() => { setKeybindDraft(defaultAnnotationKeybinds); setKeybindError(""); }}>Reset defaults</button>
              <button className="primary-button" onClick={saveShortcutSettings}>Save shortcuts</button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

function labelName(label: AnnotationLabel) {
  if (label === "complaint") return "Complaint";
  if (label === "not_complaint") return "Not complaint";
  return "Not Cebuano-English";
}
