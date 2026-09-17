# Review Annotator

A mobile-friendly research tool for labeling Cebuano–English food-delivery
reviews. The public repository contains the application code and safe sample
data only. Real reviews, account details, and research labels are kept outside
the repository.

> This is a research-support tool, not an automatic classifier. Human
> annotators make every labeling decision.

## Included workflow

- Two independent annotators label every candidate review.
- One fast, mutually exclusive label: Complaint, Not complaint, or Not Cebuano-English.
- Skipped reviews remain in the same annotator's queue.
- Each annotator has a private recent-labels panel and a searchable **My labels** page for correcting earlier labels.
- Annotation keyboard shortcuts can be customized per annotator and device.
- Only disagreements are shown to the third adjudicator.
- The admin dashboard calculates one nominal Cohen's kappa across all three labels before adjudication.
- Final labels can be exported as CSV.
- Candidate CSVs are imported through the admin dashboard and are not stored in this repository.

## Technology

- **Next.js + React** build the pages and interactive interface.
- **TypeScript** describes the shape of the data and catches common mistakes.
- **Supabase** provides sign-in, PostgreSQL storage, and access-control rules.
- **Vercel** can host the Next.js website.

## How the code is organized

| Folder | What it contains |
| --- | --- |
| `src/app` | Routes: each `page.tsx` file corresponds to a URL in the website. |
| `src/components` | The visible workspaces, forms, buttons, and dashboards. |
| `src/lib/data.ts` | All reads and writes between the interface and Supabase. |
| `src/lib/types.ts` | Shared TypeScript definitions for reviews, labels, and users. |
| `src/lib/demo-data.ts` | Safe sample records used when Supabase is not configured. |
| `supabase/migrations` | The database tables, functions, and access-control rules. |

If you are learning the project, start with
[`CODE_WALKTHROUGH.md`](./CODE_WALKTHROUGH.md). It explains what happens from
opening a page to saving a label.

See [SETUP.md](./SETUP.md) for the step-by-step online setup.

## Local preview

```powershell
pnpm install
pnpm dev
```

Without Supabase environment variables, the website automatically uses safe preview data.

## Important privacy rule

Do not commit real review CSVs, `.env` files, passwords, or Supabase service-role
keys. Import research data through the private admin page after deployment.
