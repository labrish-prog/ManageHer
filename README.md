# ManageHer MVP

ManageHer is a local working MVP for Dr. Cornelia Walters-Jones: an AI-powered Sales Development Manager that tracks prospects, opportunities, outreach, proposal outlines, follow-ups, and dashboard actions.

## What is included

- Executive dashboard with pipeline metrics and recommended action
- Companies, contacts, opportunities, proposal builder, knowledge base, settings, and login views
- Local API for companies, opportunities, AI research, outreach, follow-up sequences, meeting briefs, and proposal outlines
- Seed data tailored to Dr. Cornelia Walters-Jones' consulting focus
- OpenAI-ready AI integration with a deterministic local fallback when `OPENAI_API_KEY` is not set
- PostgreSQL schema in `schema.sql`
- Basic authentication structure suitable for replacing with a real auth provider

## Run locally

```bash
node server.js
```

Then open:

```text
http://localhost:4173
```

If port `4173` is busy, set `PORT` in `.env.local`, `.env`, or in your shell.

## AI setup

The app loads `.env` and `.env.local` automatically. Add:

```text
OPENAI_API_KEY=your_key_here
OPENAI_MODEL=gpt-4.1-mini
```

Without an API key, ManageHer still works using structured local generation so the first milestone can be tested immediately.

## Login setup

ManageHer protects the app and API with a signed session cookie. Configure:

```text
SESSION_SECRET=replace-with-a-long-random-value
ADMIN_EMAIL=cornelia@example.com
ADMIN_PASSWORD_HASH=...
```

Generate a password hash with:

```bash
npm run hash-password -- "your-password"
```

Paste the output into `ADMIN_PASSWORD_HASH`.

## First milestone flow

1. Open the dashboard.
2. Add a company.
3. Create an opportunity.
4. Use AI Sales Agent to research the prospect.
5. Generate outreach and a five-step follow-up sequence.
6. Generate a proposal outline.
7. Return to the dashboard to see updated pipeline metrics and next actions.

## Database

The MVP stores local data in `data/leadher-db.json` for easy testing. To use PostgreSQL, create the schema from `schema.sql`, set `DATABASE_URL`, and install the `pg` package. If `DATABASE_URL` is absent, the app stays in JSON mode.

For Render Postgres, copy the database's external database URL locally and run:

```bash
npm install
npm run db:setup
```

For the deployed Render web service, add the database's internal database URL as the `DATABASE_URL` environment variable.

The production database shape maps to the requested tables:

- `users`
- `companies`
- `contacts`
- `opportunities`
- `proposals`
- `tasks`
- `interaction_notes`
- `knowledge_documents`

## Security notes

This MVP includes a login screen and a server-side session cookie scaffold. Replace the demo login with hashed passwords, CSRF protection, rate limiting, and a managed auth provider before production use.
