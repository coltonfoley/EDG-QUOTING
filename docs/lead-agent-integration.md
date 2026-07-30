# Jacob's Codex lead-assessment writeback

Rainmaker keeps this integration deliberately small:

1. Jacob's Codex checks for unassessed inquiries.
2. It decides only `fit` or `not_fit`.
3. For `fit`, it creates the reply draft in Jacob's Gmail.
4. It writes the outcome, one short reason, and the Gmail draft pointer back to Rainmaker.
5. Jacob reviews and sends from Gmail. Rainmaker never stores the email body or sends it.

## Authentication

Jacob's scheduled Codex task uses Jacob's existing authenticated Rainmaker
session. No separate agent API key is required. If that session expires, the
task must sign back into Rainmaker before it can read or update leads.

## Find pending inquiries

```http
GET /api/lead-agent/inquiries/pending?limit=50
```

This returns one row per unassessed `new` inquiry, oldest first. Previously
assessed inquiries and legacy account-level lead fields are not inferred into
the queue.

## Write an assessment

Use one non-PII idempotency key for each intended result:

```http
PUT /api/inquiries/123/agent-assessment
Content-Type: application/json

{
  "outcome": "fit",
  "reason": "In our service area and asking about a core EDG product.",
  "gmailDraftId": "gmail-draft-id",
  "gmailMessageId": "gmail-message-id",
  "gmailDraftUrl": "https://mail.google.com/mail/u/0/#drafts/gmail-message-id",
  "idempotencyKey": "lead-123-assessment-v1"
}
```

For `not_fit`, omit every Gmail field:

```json
{
  "outcome": "not_fit",
  "reason": "Outside EDG's current service area.",
  "idempotencyKey": "lead-123-assessment-v1"
}
```

The first accepted write returns `201`. An exact retry returns `200` with
`replayed: true`. Reusing the key for different content returns `409`.

Assessment rows and privacy-minimized business events are append-only. A later
correction uses a new idempotency key and, for a fit correction, a new Gmail
message ID. The newest assessment is what the Leads page displays.
Rainmaker automatically removes an inquiry from this review page if an
existing workflow later converts or otherwise closes the inquiry.

## Retry rule around Gmail

Choose the assessment idempotency key before creating the Gmail draft. Once
Gmail returns the draft and message IDs, retain those exact values until
Rainmaker accepts the writeback. If writeback times out, retry the same
writeback; do not create another Gmail draft. If the automation loses its
in-memory result, it must reconcile the existing Gmail draft for that inquiry
before creating one. Rainmaker uniquely constrains Gmail draft and message IDs
so one draft cannot be attached to multiple inquiries.
