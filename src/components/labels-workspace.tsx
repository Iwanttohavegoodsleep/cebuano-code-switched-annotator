"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { demoRecentAnnotations } from "@/lib/demo-data";
import { getAllAnnotations, getCurrentProfile, getProgress, saveAnnotation } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import type { AnnotationLabel, Profile, RecentAnnotation } from "@/lib/types";

const demoProfile: Profile = { id: "demo", display_name: "Annotator 1", role: "annotator" };
type Filter = "all" | AnnotationLabel;

export function LabelsWorkspace() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(isSupabaseConfigured ? null : demoProfile);
  const [items, setItems] = useState<RecentAnnotation[]>(isSupabaseConfigured ? [] : demoRecentAnnotations.map((item, index) => ({ ...item, annotation_number: 481 - index })));
  const [completed, setCompleted] = useState(isSupabaseConfigured ? 0 : 481);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [editing, setEditing] = useState<number | null>(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    void (async () => {
      try {
        const currentProfile = await getCurrentProfile();
        if (!currentProfile) return router.replace("/login");
        if (currentProfile.role !== "annotator") return router.replace(currentProfile.role === "admin" ? "/admin" : "/adjudicate");
        const [history, progress] = await Promise.all([getAllAnnotations(), getProgress()]);
        setProfile(currentProfile);
        setItems(history);
        setCompleted(progress.completed);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not load your labels.");
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  const visible = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return items.filter((item) => {
      if (filter !== "all" && item.label !== filter) return false;
      return !normalized || item.review_text.toLowerCase().includes(normalized) || item.candidate_id.toLowerCase().includes(normalized);
    });
  }, [filter, items, query]);

  async function changeLabel(item: RecentAnnotation, label: AnnotationLabel) {
    setError("");
    try {
      await saveAnnotation(item.id, label);
      setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, label, updated_at: new Date().toISOString() } : entry));
      setEditing(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The label could not be changed.");
    }
  }

  if (loading || !profile) return <div className="center-state"><span className="spinner" />Loading your labels…</div>;

  return (
    <main className="app-shell labels-page">
      <AppHeader name={profile.display_name} role={profile.role} />
      <section className="labels-workspace">
        <div className="labels-page-heading">
          <div><span className="eyebrow">YOUR WORK</span><h1>My labels</h1><p>Review, search, and correct any label you submitted.</p></div>
          <Link className="primary-button compact" href="/">Continue annotating</Link>
        </div>

        <div className="labels-toolbar">
          <label className="history-search"><span className="sr-only">Search labels</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search review text or ID…" /></label>
          <div className="label-filters" aria-label="Filter by label">
            {(["all", "complaint", "not_complaint", "not_cebuano_english"] as Filter[]).map((value) => (
              <button key={value} className={filter === value ? "is-active" : ""} onClick={() => setFilter(value)}>{filterName(value)}</button>
            ))}
          </div>
        </div>

        {error && <div className="error-banner" role="alert">{error}</div>}
        <div className="labels-summary"><strong>{visible.length.toLocaleString()}</strong> shown <span>·</span> {completed.toLocaleString()} total labels</div>

        <ol className="all-labels-list">
          {visible.map((item, index) => {
            const number = item.annotation_number ?? Math.max(1, completed - index);
            return (
              <li key={item.id}>
                <div className="all-labels-meta"><strong>Review {number.toLocaleString()}</strong><span>{item.candidate_id}</span></div>
                <p>{item.review_text}</p>
                <div className="all-labels-actions">
                  <span className={`label-chip ${item.label}`}>{labelName(item.label)}</span>
                  <div>
                    {item.discussion_ready
                      ? <Link href={`/discussions?review=${item.id}`}>Discuss</Link>
                      : <span title="Discussion opens after both primary annotators label this review.">Waiting for partner</span>}
                    <button onClick={() => setEditing(editing === item.id ? null : item.id)}>{editing === item.id ? "Cancel" : "Change label"}</button>
                  </div>
                </div>
                {editing === item.id && (
                  <div className="inline-label-editor">
                    <button onClick={() => void changeLabel(item, "complaint")}>Yes · Complaint</button>
                    <button onClick={() => void changeLabel(item, "not_complaint")}>No · Not complaint</button>
                    <button onClick={() => void changeLabel(item, "not_cebuano_english")}>Not Cebuano-English</button>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
        {!visible.length && <div className="history-empty"><p>No labels match your search.</p></div>}
      </section>
    </main>
  );
}

function labelName(label: AnnotationLabel) {
  if (label === "complaint") return "Complaint";
  if (label === "not_complaint") return "Not complaint";
  return "Not Cebuano-English";
}

function filterName(filter: Filter) {
  if (filter === "all") return "All";
  return labelName(filter);
}
