# Deployment

## Web
Deploy `apps/web` as a static site.

## Worker
Deploy `apps/worker` using Wrangler.

Set these environment variables / secrets:

- `VAPID_SUBJECT`
- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `ADMIN_TOKEN` (recommended)

The worker also requires:

- a KV namespace bound as `SUBSCRIPTIONS`
- the cron trigger in `wrangler.toml` so prayer reminders can be evaluated every minute
