"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import type { AppRole } from "@/lib/types";

export function AppHeader({ name, role }: { name: string; role: AppRole }) {
  const router = useRouter();
  const initials = name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();

  async function handleSignOut() {
    await signOut();
    router.replace("/login");
  }

  return (
    <header className="topbar">
      <Link className="brand" href={role === "admin" ? "/admin" : role === "adjudicator" ? "/adjudicate" : "/"}>
        <span className="brand-mark" aria-hidden="true">A</span>
        <div>
          <strong>Review Annotator</strong>
          <span>Cebuano–English Study</span>
        </div>
      </Link>
      <div className="user-area">
        <nav className="header-nav" aria-label="Main navigation"><NavigationLinks role={role} /></nav>
        <details className="mobile-menu">
          <summary>Menu</summary>
          <nav aria-label="Mobile navigation"><NavigationLinks role={role} /></nav>
        </details>
        <span className="user-dot" aria-hidden="true">{initials}</span>
        <span className="user-name">{name}</span>
        {isSupabaseConfigured && <button className="sign-out" onClick={handleSignOut}>Sign out</button>}
      </div>
    </header>
  );
}

function NavigationLinks({ role }: { role: AppRole }) {
  return (
    <>
      {role === "annotator" && <Link className="header-link" href="/">Annotate</Link>}
      {role === "annotator" && <Link className="header-link" href="/labels">My labels</Link>}
      {role === "annotator" && <Link className="header-link" href="/discussions">Discussions</Link>}
      {role === "admin" && <Link className="header-link" href="/admin">Dashboard</Link>}
      {role === "adjudicator" && <Link className="header-link" href="/adjudicate">Adjudication</Link>}
      <Link className="header-link" href="/guide">Guide</Link>
    </>
  );
}
