"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AnnotationGuide } from "@/components/annotation-guide";
import { AppHeader } from "@/components/app-header";
import { getCurrentProfile } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types";

const demoProfile: Profile = { id: "demo", display_name: "Annotator 1", role: "annotator" };

export function GuideWorkspace() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(isSupabaseConfigured ? null : demoProfile);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    void (async () => {
      try {
        const currentProfile = await getCurrentProfile();
        if (!currentProfile) return router.replace("/login");
        setProfile(currentProfile);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not open the guide.");
      }
    })();
  }, [router]);

  if (!profile) return <div className="center-state"><span className="spinner" />Loading the guide…</div>;

  return (
    <main className="app-shell guide-page">
      <AppHeader name={profile.display_name} role={profile.role} />
      <article className="guide-workspace">
        <div className="page-heading">
          <div><span className="eyebrow">REFERENCE</span><h1>Annotation guide</h1><p>Use these rules consistently for every review.</p></div>
        </div>
        {error && <div className="error-banner" role="alert">{error}</div>}
        <AnnotationGuide />
      </article>
    </main>
  );
}
