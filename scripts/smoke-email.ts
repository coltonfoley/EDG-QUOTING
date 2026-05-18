import dotenv from "dotenv";
import { sendEmail } from "../server/email";

dotenv.config({ path: ".env.local" });
dotenv.config();

const recipient = process.env.EMAIL_SMOKE_TO?.trim() || process.argv[2]?.trim();

if (!recipient) {
  console.error("EMAIL_SMOKE_TO or recipient argument is required.");
  console.error("Example: EMAIL_SMOKE_TO=you@example.com npm run smoke:email");
  process.exit(1);
}

const provider = process.env.EMAIL_PROVIDER || "google-workspace-gmail";
const timestamp = new Date().toISOString();

try {
  const result = await sendEmail({
    to: recipient,
    subject: `Rainmaker email smoke test - ${provider}`,
    textBody: `Rainmaker email provider smoke test passed at ${timestamp} using ${provider}.`,
    htmlBody: `
      <div style="font-family: Arial, sans-serif; line-height: 1.5;">
        <h2>Rainmaker email smoke test</h2>
        <p>Email provider: <strong>${provider}</strong></p>
        <p>Sent at: ${timestamp}</p>
      </div>
    `,
  });

  console.log("Rainmaker email smoke test sent.");
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error("Rainmaker email smoke test failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
