"use client";

import { ChangeEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import { AppHeader } from "@/components/app-header";
import { getAdminOverview, getCurrentProfile, getFinalDataset, importReviewBatch } from "@/lib/data";
import { demoOverview } from "@/lib/demo-data";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import type { AdminOverview, Profile } from "@/lib/types";

const demoProfile: Profile = { id: "demo-admin", display_name: "Research Admin", role: "admin" };

export function AdminDashboard() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(isSupabaseConfigured ? null : demoProfile);
  const [overview, setOverview] = useState<AdminOverview | null>(isSupabaseConfigured ? null : demoOverview);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    setLoading(true);
    try {
      const current = await getCurrentProfile();
      if (!current) return router.replace("/login");
      if (current.role === "annotator") return router.replace("/");
      if (current.role === "adjudicator") return router.replace("/adjudicate");
      setProfile(current);
      setOverview(await getAdminOverview());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load the dashboard.");
    } finally { setLoading(false); }
  }, [router]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (overview?.annotators.some((person) => person.completed > 0)) {
      setError("Candidate import is locked because annotation has already started.");
      event.target.value = "";
      return;
    }
    setNotice(""); setError("");
    Papa.parse<Record<string, string>>(file, {
      header: true, skipEmptyLines: true,
      complete: async ({ data, errors, meta }) => {
        if (errors.length) return setError(`CSV problem: ${errors[0].message}`);
        try {
          const headers = new Set((meta.fields ?? []).map((field) => field.trim().toLowerCase()));
          if (["annotation_status", "annotator_1_label", "annotator_2_label", "final_label", "binary_complaint_label"].some((field) => headers.has(field))) {
            throw new Error("This is an annotation-results export, not a candidate file. Nothing was imported.");
          }
          if (!["candidate_id", "review_id", "id"].some((field) => headers.has(field))) {
            throw new Error("The candidate CSV needs a candidate_id column.");
          }
          if (!["review_text", "review", "text", "comment", "content"].some((field) => headers.has(field))) {
            throw new Error("The candidate CSV needs a review_text or text column.");
          }
          const rows = data.map((row, index) => {
            const text = first(row, ["review_text", "review", "text", "comment", "content"]);
            if (!text) throw new Error(`Row ${index + 2} has no review text.`);
            return {
              candidate_id: first(row, ["candidate_id", "review_id", "id"]) || `${file.name}-${index + 1}`,
              review_text: text,
              source_tier: first(row, ["source_tier", "confidence_tier", "tier"]) || tierFromFilename(file.name),
              source_order: Number(first(row, ["source_order", "source_row_index", "rank", "index"])) || index + 1,
            };
          });
          if (!rows.length) throw new Error("The candidate CSV contains no review rows.");
          const candidateIds = new Set<string>();
          for (const row of rows) {
            if (candidateIds.has(row.candidate_id)) throw new Error(`Duplicate candidate ID in this file: ${row.candidate_id}`);
            candidateIds.add(row.candidate_id);
          }
          await importReviewBatch(rows);
          setNotice(`${rows.length.toLocaleString()} reviews imported. Existing candidate IDs were kept unchanged.`);
          await load();
        } catch (cause) { setError(cause instanceof Error ? cause.message : "Import failed."); }
        event.target.value = "";
      },
    });
  }

  async function download() {
    if (!overview || exporting) return;
    setExporting(true);
    setNotice("");
    setError("");
    try {
      const rows = await getFinalDataset();
      if (rows.length !== overview.total_reviews) {
        throw new Error(`Export stopped at ${rows.length.toLocaleString()} of ${overview.total_reviews.toLocaleString()} reviews. No incomplete file was downloaded.`);
      }
      const blob = new Blob(["\uFEFF", Papa.unparse(rows)], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `final-annotations-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice(`${rows.length.toLocaleString()} annotation rows downloaded.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Export failed.");
    } finally {
      setExporting(false);
    }
  }

  if (loading || !profile || !overview) return <div className="center-state"><span className="spinner" />Loading dashboard…</div>;

  const importLocked = overview.annotators.some((person) => person.completed > 0);

  return (
    <main className="app-shell">
      <AppHeader name={profile.display_name} role={profile.role} />
      <section className="admin-workspace">
        <div className="page-heading"><div><span className="eyebrow">PROJECT OVERVIEW</span><h1>Annotation dashboard</h1><p>Progress and agreement statistics for the research team.</p></div><button className="secondary-button" onClick={() => void load()}>Refresh</button></div>
        {!isSupabaseConfigured && <div className="demo-notice">Preview data is shown until Supabase is connected.</div>}
        {error && <div className="error-banner" role="alert">{error}</div>}{notice && <div className="success-banner">{notice}</div>}
        <div className="stats-grid">
          <Metric label="Candidate reviews" value={overview.total_reviews.toLocaleString()} />
          <Metric label="Double-annotated" value={overview.double_annotated.toLocaleString()} />
          <Metric label="Open disagreements" value={overview.pending_disagreements.toLocaleString()} />
          <Metric label="Adjudicated" value={overview.adjudicated.toLocaleString()} />
        </div>
        <div className="dashboard-grid">
          <section className="dashboard-card"><div className="card-heading"><div><span className="eyebrow">RELIABILITY</span><h2>Inter-annotator agreement</h2></div></div><div className="reliability-grid single"><Agreement title="Three-label annotation" kappa={overview.annotation_kappa} agreement={overview.annotation_agreement_percent} /></div><p className="card-note">One nominal Cohen’s kappa across Complaint, Not complaint, and Not Cebuano-English, calculated before adjudication.</p></section>
          <section className="dashboard-card"><div className="card-heading"><div><span className="eyebrow">ANNOTATORS</span><h2>Individual progress</h2></div></div><div className="annotator-list">{overview.annotators.map((person) => <div key={person.id}><span>{person.name}</span><strong>{person.completed.toLocaleString()} <small>completed</small></strong><div><i style={{ width: `${overview.total_reviews ? Math.min(100, person.completed / overview.total_reviews * 100) : 0}%` }} /></div></div>)}</div></section>
        </div>
        <section className="dashboard-card data-card"><div><span className="eyebrow">DATA</span><h2>Candidate data and annotation results</h2><p>{importLocked ? "Candidate import is locked because annotation has started. Export preserves both original labels and the final decision." : "Import the fixed candidate set before annotation begins. Result exports cannot be imported as candidates."}</p></div><div className="data-actions"><label className={`secondary-button file-button ${!isSupabaseConfigured || importLocked ? "is-disabled" : ""}`}>Import candidates<input type="file" accept=".csv,text/csv" onChange={upload} disabled={!isSupabaseConfigured || importLocked} /></label><button className="primary-button compact" onClick={() => void download()} disabled={!isSupabaseConfigured || exporting}>{exporting ? "Preparing export…" : "Export all results"}</button></div></section>
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) { return <section className="metric-card"><span>{label}</span><strong>{value}</strong></section>; }
function Agreement({ title, kappa, agreement }: { title: string; kappa: number | null; agreement: number | null }) { return <div className="agreement-block"><span>{title}</span><strong>{kappa === null ? "—" : kappa.toFixed(2)}</strong><small>Cohen’s κ · {agreement === null ? "—" : `${agreement.toFixed(1)}% raw agreement`}</small></div>; }
function first(row: Record<string, string>, keys: string[]) { const normalized = Object.fromEntries(Object.entries(row).map(([key, value]) => [key.trim().toLowerCase(), String(value ?? "").trim()])); return keys.map((key) => normalized[key]).find(Boolean) ?? ""; }
function tierFromFilename(filename: string) { const value = filename.toLowerCase(); return value.includes("tier_a") ? "TIER_A_CONFIDENT" : value.includes("tier_b") ? "TIER_B_LIKELY" : value.includes("tier_c") ? "TIER_C_RECHECK" : "IMPORTED"; }
