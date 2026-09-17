"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { getCurrentProfile, getNextDisagreement, saveAdjudication } from "@/lib/data";
import { demoDisagreements } from "@/lib/demo-data";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import type { AnnotationLabel, Disagreement, Profile } from "@/lib/types";

const demoProfile: Profile = { id: "demo-adjudicator", display_name: "Adjudicator", role: "adjudicator" };

export function AdjudicationWorkspace() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(isSupabaseConfigured ? null : demoProfile);
  const [item, setItem] = useState<Disagreement | null>(isSupabaseConfigured ? null : demoDisagreements[0]);
  const [demoIndex, setDemoIndex] = useState(0);
  const [resolved, setResolved] = useState(0);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    setLoading(true);
    try {
      const current = await getCurrentProfile();
      if (!current) return router.replace("/login");
      if (current.role === "annotator") return router.replace("/");
      if (current.role === "admin") return router.replace("/admin");
      setProfile(current);
      setItem(await getNextDisagreement());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load disagreements.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const finish = useCallback(async (label: AnnotationLabel) => {
    if (!item) return;
    setError("");
    try {
      await saveAdjudication(item.id, label);
      setResolved((value) => value + 1);
      if (isSupabaseConfigured) setItem(await getNextDisagreement());
      else {
        const next = demoIndex + 1;
        setDemoIndex(next);
        setItem(next < demoDisagreements.length ? demoDisagreements[next] : null);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save the final label.");
    }
  }, [demoIndex, item]);

  const yes = useCallback(() => void finish("complaint"), [finish]);
  const no = useCallback(() => void finish("not_complaint"), [finish]);
  const wrongLanguage = useCallback(() => void finish("not_cebuano_english"), [finish]);

  useEffect(() => {
    function keys(event: KeyboardEvent) {
      if (event.repeat || loading) return;
      const key = event.key.toLowerCase();
      if (key === "y" || key === "1") yes();
      if (key === "n" || key === "2") no();
      if (key === "l" || key === "3") wrongLanguage();
    }
    window.addEventListener("keydown", keys);
    return () => window.removeEventListener("keydown", keys);
  }, [loading, no, wrongLanguage, yes]);

  if (loading || !profile) return <div className="center-state"><span className="spinner" />Loading disagreements…</div>;

  return (
    <main className="app-shell">
      <AppHeader name={profile.display_name} role={profile.role} />
      <section className="workspace">
        <div className="page-heading"><div><span className="eyebrow">DISAGREEMENT QUEUE</span><h1>Final decision</h1><p>Only reviews where the two annotators disagree appear here.</p></div><span className="count-pill">{resolved} resolved this session</span></div>
        {error && <div className="error-banner" role="alert">{error}</div>}
        {item ? <>
          <article className="review-card"><div className="review-label">REVIEW TEXT</div><blockquote>{item.review_text}</blockquote></article>
          <section className="comparison-card">
            <p className="comparison-title">Previous labels</p>
            <div className="label-comparison">
              <div><span>Annotator 1</span><strong>{formatLabel(item.annotator_1_label)}</strong></div>
              <div><span>Annotator 2</span><strong>{formatLabel(item.annotator_2_label)}</strong></div>
            </div>
          </section>
          <section className="decision-panel">
            <p className="step-name">Final label</p>
            <h2>Does this review express a complaint?</h2>
            <p className="question-help">Use Yes or No when it is Cebuano-English. Otherwise, choose Not Cebuano-English.</p>
            <div className="answer-grid">
              <button className="answer-button answer-yes" onClick={yes}><kbd>Y</kbd><span><strong>Yes</strong><small>Complaint</small></span></button>
              <button className="answer-button answer-no" onClick={no}><kbd>N</kbd><span><strong>No</strong><small>Not a complaint</small></span></button>
              <button className="answer-button answer-language" onClick={wrongLanguage}><kbd>L</kbd><span><strong>Not Cebuano-English</strong><small>Wrong language or not genuinely code-switched</small></span></button>
            </div>
          </section>
        </> : <section className="empty-card"><span className="complete-mark">✓</span><h2>No disagreements waiting</h2><p>The queue will update when both annotators complete the same reviews.</p></section>}
      </section>
    </main>
  );
}

function formatLabel(label: AnnotationLabel) {
  if (label === "complaint") return "Yes · Complaint";
  if (label === "not_complaint") return "No · Not a complaint";
  return "Not Cebuano-English";
}
