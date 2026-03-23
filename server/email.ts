import { Resend } from "resend";

const resendApiKey = process.env.RESEND_API_KEY;
const fromEmail = process.env.FROM_EMAIL || "onboarding@resend.dev";

if (!resendApiKey) {
    console.warn("⚠️ WARNING: RESEND_API_KEY is missing");
}

const resend = resendApiKey ? new Resend(resendApiKey) : null;

/**
 * Send reset password email
 */
export async function sendResetPasswordEmail(
    to: string,
    resetLink: string
) {
    console.log("[EMAIL] sendResetPasswordEmail CALLED");
    console.log("[EMAIL] TO:", to);
    console.log("[EMAIL] FROM:", fromEmail);
    console.log(
        "[EMAIL] KEY:",
        process.env.RESEND_API_KEY ? "LOADED" : "MISSING"
    );

    if (!resend) {
        throw new Error("RESEND_API_KEY not configured");
    }

    try {
        const response = await resend.emails.send({
            from: fromEmail, // must be a verified sender
            to,
            subject: "Reset your password",
            html: `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
          <div style="text-align: center; margin-bottom: 20px;">
            <h1 style="color: #2563eb; margin: 0;">BOQ Management System</h1>
            <p style="color: #64748b; font-size: 16px;">Secure Password Reset</p>
          </div>
          <div style="background-color: #f8fafc; padding: 20px; border-radius: 6px;">
            <p style="font-size: 16px; color: #1e293b;">Hello,</p>
            <p style="font-size: 14px; color: #475569; line-height: 1.5;">
              We received a request to reset your password for the BOQ Management System. 
              Click the button below to set a new password:
            </p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${resetLink}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
                Reset Password
              </a>
            </div>
            <p style="font-size: 12px; color: #94a3b8; line-height: 1.4;">
              If you did not request this, please ignore this email. This link will expire in 1 hour.
            </p>
          </div>
          <div style="margin-top: 20px; text-align: center; font-size: 12px; color: #94a3b8;">
            © ${new Date().getFullYear()} BOQ Management System. All rights reserved.
          </div>
        </div>
      `,
        });

        console.log("[RESEND SUCCESS]", response);
        return response;
    } catch (error) {
        console.error("[RESEND ERROR]", error);
        throw error;
    }
}

/**
 * Send sketch plan report email with PDF attachment
 */
export async function sendSketchPlanEmail(
  to: string,
  planName: string,
  pdfBase64: string
) {
  if (!resend) {
    throw new Error("RESEND_API_KEY not configured");
  }

  try {
    const response = await resend.emails.send({
      from: fromEmail,
      to,
      subject: `Sketch Plan Report: ${planName}`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #2563eb;">Sketch Plan Report</h1>
          <p>Please find the requested sketch plan report for <strong>${planName}</strong> attached to this email.</p>
          <hr style="border: 1px solid #eee; margin: 20px 0;" />
          <p style="font-size: 12px; color: #666;">Sent from BOQ Management System</p>
        </div>
      `,
      attachments: [
        {
          filename: `${planName.replace(/\s+/g, '_')}_Report.pdf`,
          content: pdfBase64,
        },
      ],
    });

    return response;
  } catch (error) {
    console.error("[EMAIL ERROR] sendSketchPlanEmail:", error);
    throw error;
  }
}
