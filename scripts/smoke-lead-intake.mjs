const baseUrl = process.env.RAINMAKER_BASE_URL;
const intakeUrl = process.env.RAINMAKER_LEAD_INTAKE_URL
  || (baseUrl ? `${baseUrl.replace(/\/$/, "")}/api/leads/intake` : "");
const apiKey = process.env.RAINMAKER_API_KEY;

if (!intakeUrl || !apiKey) {
  console.error("Missing RAINMAKER_BASE_URL or RAINMAKER_LEAD_INTAKE_URL, plus RAINMAKER_API_KEY.");
  process.exit(1);
}

const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const payload = {
  email: process.env.TEST_LEAD_EMAIL || `lead-intake-smoke+${timestamp}@example.com`,
  firstName: "Lead",
  lastName: "Smoke Test",
  phone: "815-555-0138",
  location: "60081",
  projectType: "Motorized Shades",
  message: `Smoke test lead created at ${new Date().toISOString()}.`,
  source: "rainmaker-smoke-test",
  customerType: "homeowner",
};

const response = await fetch(intakeUrl, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(payload),
});

const responseText = await response.text();
let body = responseText;
try {
  body = responseText ? JSON.parse(responseText) : null;
} catch {
  // Keep the raw response text for troubleshooting.
}

if (!response.ok) {
  console.error("Lead intake smoke test failed.");
  console.error(JSON.stringify({ status: response.status, body }, null, 2));
  process.exit(1);
}

console.log("Lead intake smoke test passed.");
console.log(JSON.stringify(body, null, 2));
