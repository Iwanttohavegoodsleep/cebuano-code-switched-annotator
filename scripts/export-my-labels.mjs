import fs from "node:fs";
import path from "node:path";
import Papa from "papaparse";
import { createClient } from "@supabase/supabase-js";

const PAGE_SIZE = 1000;

function loadLocalEnvironment() {
  const envPath = path.resolve(".env.local");
  if (!fs.existsSync(envPath)) return;

  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (!match) continue;
    const [, key, value] = match;
    process.env[key.trim()] ??= value.trim().replace(/^['"]|['"]$/g, "");
  }
}

async function fetchEveryLabel(supabase) {
  const rows = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .rpc("all_annotations_for_current_user")
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
}

loadLocalEnvironment();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const email = process.env.ANNOTATOR_EMAIL;
const password = process.env.ANNOTATOR_PASSWORD;

if (!url || !key || !email || !password) {
  throw new Error(
    "Set ANNOTATOR_EMAIL and ANNOTATOR_PASSWORD. Supabase values are read from .env.local.",
  );
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { error: signInError } = await supabase.auth.signInWithPassword({
  email,
  password,
});
if (signInError) throw signInError;

const rows = (await fetchEveryLabel(supabase))
  .sort((a, b) => Number(a.annotation_number) - Number(b.annotation_number))
  .map((row) => ({
    candidate_id: row.candidate_id,
    review_text: row.review_text,
    source_tier: row.source_tier,
    label: row.label,
    annotation_number: row.annotation_number,
  }));

const outputPath = path.resolve(
  process.argv[2] ?? "exports/my-annotations.csv",
);
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `\uFEFF${Papa.unparse(rows)}\n`, "utf8");

await supabase.auth.signOut();
console.log(`Exported ${rows.length.toLocaleString()} labels to ${outputPath}`);
