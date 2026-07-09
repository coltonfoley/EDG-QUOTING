# Website Lead Intake

Rainmaker owns pre-sale lead and quote workflow. Website forms should send leads
to Rainmaker instead of storing them in a separate lead database.

## Flow

1. A visitor submits a website form.
2. The website `POST /api/leads` route validates spam/rate-limit rules.
3. The website forwards the lead to Rainmaker `POST /api/leads/intake`.
4. Rainmaker creates or updates an account and marks it as a `new` lead.
5. If the website submission includes compressed lead photos, the website uploads
   them to Rainmaker `POST /api/leads/:id/attachments`.
6. Rainmaker stores the photo files in object storage and stores attachment
   metadata on the lead account.
7. Jacob works the lead from the Rainmaker Leads page.
8. Jacob creates a quote later when the lead is qualified.

## Rainmaker Endpoint

`POST /api/leads/intake`

Authentication uses the configured Rainmaker website bearer key:

```http
Authorization: Bearer <RAINMAKER_API_KEY>
Content-Type: application/json
```

Example payload:

```json
{
  "email": "jane@example.com",
  "firstName": "Jane",
  "lastName": "Smith",
  "phone": "815-555-0138",
  "location": "60081",
  "projectType": "Motorized Shades",
  "message": "Interested in screens for a covered patio.",
  "source": "website-contact",
  "customerType": "homeowner"
}
```

Successful response:

```json
{
  "success": true,
  "leadId": 123,
  "accountId": 123,
  "leadStatus": "new",
  "createdQuote": false
}
```

## Lead Attachments

`POST /api/leads/:id/attachments`

Authentication accepts a signed-in Rainmaker session or the same configured
`RAINMAKER_API_KEY` used by the website lead intake endpoint. The request is
`multipart/form-data` with up to four `attachments`
files. Supported file types are JPG, PNG, and WebP. Each image should already be
compressed to 1 MB or less, and the total upload should stay under 3.5 MB.

Successful response:

```json
{
  "success": true,
  "leadId": 123,
  "accountId": 123,
  "attachments": [
    {
      "id": 1,
      "accountId": 123,
      "originalName": "site-photo.jpg",
      "storageUrl": "https://..."
    }
  ]
}
```

Rainmaker `GET /api/leads` and `GET /api/accounts/:id/details` include the
attachment metadata as `attachments` and `leadAttachments` so the lead inbox,
account detail page, and Codex lead workflow can use the same context.

Before deploying the first attachment-aware build, run:

```bash
npm run db:ensure-lead-attachments
```

The app also ensures the table at runtime before reading or writing attachments.

## Website Environment

Generate a dedicated random bearer key and store the same value as
`RAINMAKER_API_KEY` in Rainmaker and the website environment.

Set these on the website deployment:

```env
RAINMAKER_BASE_URL=https://rainmaker.example.com
RAINMAKER_API_KEY=<generated-rainmaker-api-key>
```

Or set the full endpoint directly:

```env
RAINMAKER_LEAD_INTAKE_URL=https://rainmaker.example.com/api/leads/intake
RAINMAKER_API_KEY=<generated-rainmaker-api-key>
```

The current website lead route requires Rainmaker lead intake configuration and
does not store accepted leads in Supabase.

## Smoke Test

From the Rainmaker repo:

```bash
RAINMAKER_BASE_URL=http://localhost:5000 \
RAINMAKER_API_KEY=<generated-rainmaker-api-key> \
npm run smoke:lead-intake
```

This creates or updates a test lead account in the configured Rainmaker
environment. It does not create a quote.
