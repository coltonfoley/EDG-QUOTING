# Website Lead Intake

Rainmaker owns pre-sale lead and quote workflow. Website forms should send leads
to Rainmaker instead of storing them in a separate lead database.

## Flow

1. A visitor submits a website form.
2. The website `POST /api/leads` route validates spam/rate-limit rules.
3. The website forwards the lead to Rainmaker `POST /api/leads/intake`.
4. Rainmaker creates or updates an account.
5. Rainmaker creates a quote shell in the `new_lead` stage.
6. Jacob works the lead from the Rainmaker pipeline.

## Rainmaker Endpoint

`POST /api/leads/intake`

Authentication uses the existing Rainmaker bearer API key system:

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
  "accountId": 123,
  "quoteId": 456,
  "quoteNumber": "QT-2026-..."
}
```

## Website Environment

Generate a Rainmaker API key from the Rainmaker environment with the existing
`server/seedApiKey.ts` helper, then store the printed key in the website
environment as `RAINMAKER_API_KEY`.

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

During migration, the website keeps Supabase as a fallback if Supabase env vars
are still configured. Once Rainmaker intake is verified, remove the Supabase lead
env vars from the website deployment to make Rainmaker the only lead store.

## Smoke Test

From the Rainmaker repo:

```bash
RAINMAKER_BASE_URL=http://localhost:5000 \
RAINMAKER_API_KEY=<generated-rainmaker-api-key> \
npm run smoke:lead-intake
```

This creates a test account/quote in the configured Rainmaker environment.
