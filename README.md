# Cebuano Code-Switched Review Annotator

A web application for building an auditable human-labeled dataset of
Cebuano-English food-delivery reviews. It supports the annotation workflow for
an undergraduate complaint-detection study.

## Features

- Independent labeling by two annotators
- Three mutually exclusive labels: Complaint, Not complaint, and Not Cebuano-English
- Private annotation queues and editable label history before adjudication
- Customizable keyboard shortcuts for faster annotation
- Discussion workspace for difficult examples
- Disagreement-only adjudication by a third reviewer
- Progress tracking and Cohen's kappa agreement statistics
- CSV import and final dataset export
- Role-based access for annotators, adjudicators, and administrators

## Workflow

1. An administrator imports candidate reviews.
2. Two annotators label each review independently.
3. After both annotators finish the fixed candidate set, reviews with conflicting labels enter the adjudication queue.
4. When adjudication begins, the two original label sets are locked and an adjudicator assigns the final labels.
5. The administrator exports the complete audit dataset, including both original labels and adjudication metadata.

## Technology

- Next.js and React
- TypeScript
- Supabase Authentication and PostgreSQL
- Vercel

Database tables, functions, and row-level access policies are versioned in
[`supabase/migrations`](./supabase/migrations).

## Local Development

```bash
pnpm install
pnpm dev
```

When Supabase environment variables are absent, the application runs with
synthetic demonstration data.

For database and deployment configuration, see [SETUP.md](./SETUP.md).

## Data Privacy

This repository contains application code and synthetic examples only. Research
reviews, annotation records, account details, and environment variables are not
included.
