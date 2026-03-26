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
  pdfBase64: string,
  planData?: {
    projectName?: string;
    location?: string;
    planDate?: string;
    items?: any[];
  }
) {
  if (!resend) {
    throw new Error("RESEND_API_KEY not configured");
  }

  try {
    let emailHtml = `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; color: #334155; line-height: 1.6;">
        <div style="border-bottom: 2px solid #2563eb; padding-bottom: 20px; margin-bottom: 20px; text-align: center;">
          <h1 style="color: #1e40af; margin: 0; font-size: 24px; text-transform: uppercase; letter-spacing: 1px;">Concept Trunk Interiors</h1>
          <p style="color: #64748b; margin: 5px 0 0 0; font-size: 14px; font-weight: bold;">SITE SKETCH PLAN REPORT</p>
        </div>

        <div style="background-color: #f8fafc; border-radius: 8px; padding: 15px; margin-bottom: 25px; border: 1px solid #e2e8f0;">
          <table style="width: 100%; font-size: 13px;">
            <tr>
              <td style="padding: 4px 0;"><strong>Plan Name:</strong> ${planName}</td>
              <td style="padding: 4px 0; text-align: right;"><strong>Date:</strong> ${planData?.planDate || new Date().toLocaleDateString()}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0;"><strong>Project:</strong> ${planData?.projectName || 'N/A'}</td>
              <td style="padding: 4px 0; text-align: right;"><strong>Location:</strong> ${planData?.location || 'N/A'}</td>
            </tr>
          </table>
        </div>
    `;

    if (planData?.items && planData.items.length > 0) {
      emailHtml += `
        <h2 style="font-size: 16px; color: #1e40af; border-left: 4px solid #2563eb; padding-left: 10px; margin-bottom: 15px;">Site Requirements & Dimensions</h2>
        <table style="width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 25px;">
          <thead>
            <tr style="background-color: #f1f5f9; text-align: left;">
              <th style="border: 1px solid #e2e8f0; padding: 10px;">#</th>
              <th style="border: 1px solid #e2e8f0; padding: 10px;">Item / Product</th>
              <th style="border: 1px solid #e2e8f0; padding: 10px;">Dimensions (L x W x H)</th>
              <th style="border: 1px solid #e2e8f0; padding: 10px; text-align: center;">Qty</th>
              <th style="border: 1px solid #e2e8f0; padding: 10px;">Unit</th>
            </tr>
          </thead>
          <tbody>
      `;

      planData.items.forEach((item, idx) => {
        emailHtml += `
          <tr>
            <td style="border: 1px solid #e2e8f0; padding: 8px; text-align: center;">${idx + 1}</td>
            <td style="border: 1px solid #e2e8f0; padding: 8px;">
              <div style="font-weight: bold; color: #0f172a;">${item.item_name || 'N/A'}</div>
              ${item.description ? `<div style="font-size: 11px; color: #64748b; margin-top: 2px;"><i>${item.description}</i></div>` : ''}
            </td>
            <td style="border: 1px solid #e2e8f0; padding: 8px; text-align: center;">
              ${item.length || '0'} x ${item.width || '0'} x ${item.height || '0'} ${item.dimension_unit === 'feet' ? 'ft' : 'mm'}
            </td>
            <td style="border: 1px solid #e2e8f0; padding: 8px; text-align: center; font-weight: bold; color: #2563eb;">${item.qty || '0'}</td>
            <td style="border: 1px solid #e2e8f0; padding: 8px;">${item.unit || 'Nos'}</td>
          </tr>
        `;
      });

      emailHtml += `
          </tbody>
        </table>
      `;
    }

    emailHtml += `
        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8; text-align: center;">
          <p>This is an automated report generated from the BOQ Management System.</p>
          <p>&copy; ${new Date().getFullYear()} Concept Trunk Interiors. All rights reserved.</p>
        </div>
      </div>
    `;

    const response = await resend.emails.send({
      from: fromEmail,
      to,
      subject: `Sketch Plan Report: ${planName}`,
      html: emailHtml,
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

/**
 * Send professional Site Report email
 */
export async function sendSiteReportEmail(
  to: string | string[],
  report: any,
  tasks: any[]
) {
  if (!resend) {
    throw new Error("RESEND_API_KEY not configured");
  }

  try {
    const reportDate = report.report_date || report.reportDate;
    const projectName = report.project_name || report.projectName || 'General Project';
    const reportStatus = report.status || 'SUBMITTED';
    const reportSummary = report.summary || '';

    let emailHtml = `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 850px; margin: 0 auto; padding: 20px; color: #334155; line-height: 1.6;">
        <div style="border-bottom: 3px solid #2563eb; padding-bottom: 15px; margin-bottom: 25px; text-align: center;">
          <h1 style="color: #1e40af; margin: 0; font-size: 28px; text-transform: uppercase; letter-spacing: 2px;">Daily Site Report</h1>
          <p style="color: #64748b; margin: 5px 0 0 0; font-size: 16px;">${projectName}</p>
        </div>

        <div style="background-color: #f8fafc; border-radius: 12px; padding: 20px; margin-bottom: 30px; border: 1px solid #e2e8f0; display: table; width: 100%;">
          <div style="display: table-row;">
            <div style="display: table-cell; padding: 5px 10px;"><strong>Report Date:</strong> ${reportDate ? new Date(reportDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' }) : 'N/A'}</div>
            <div style="display: table-cell; padding: 5px 10px; text-align: right;"><strong>Status:</strong> <span style="color: #2563eb; font-weight: bold;">${reportStatus.toUpperCase()}</span></div>
          </div>
          ${reportSummary ? `
          <div style="display: table-row;">
            <div style="display: table-cell; padding: 15px 10px 5px 10px;" colspan="2"><strong>General Summary:</strong><br/>${reportSummary}</div>
          </div>` : ''}
        </div>

        <h2 style="font-size: 18px; color: #1e40af; border-left: 5px solid #2563eb; padding-left: 12px; margin-bottom: 20px;">Work Progress Details</h2>
    `;

    tasks.forEach((task, idx) => {
      const taskItemName = task.item_name || task.itemName || `Task ${idx + 1}`;
      const taskCompletion = task.completion_percentage !== undefined ? task.completion_percentage : (task.completionPercentage || 0);
      const taskDesc = task.task_description || task.taskDescription || '';

      emailHtml += `
        <div style="margin-bottom: 35px; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
          <div style="background-color: #f1f5f9; padding: 12px 15px; border-bottom: 1px solid #e2e8f0;">
            <table style="width: 100%;">
              <tr>
                <td><span style="font-weight: bold; font-size: 15px; color: #0f172a;">Task ${idx + 1}: ${taskItemName}</span></td>
                <td style="text-align: right;"><span style="background-color: #dbeafe; color: #1e40af; padding: 4px 10px; border-radius: 20px; font-size: 12px; font-weight: bold;">${taskCompletion}% Complete</span></td>
              </tr>
            </table>
          </div>
          <div style="padding: 15px;">
            ${taskDesc ? `<p style="margin: 0 0 15px 0; font-size: 14px; color: #475569;">${taskDesc}</p>` : ''}
            
            ${task.labour && task.labour.length > 0 ? `
              <div style="margin-bottom: 15px;">
                <h4 style="margin: 0 0 8px 0; font-size: 13px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">Labour Allocation</h4>
                <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                  <tr style="background-color: #f8fafc;">
                    <th style="text-align: left; padding: 6px; border: 1px solid #e2e8f0;">Labour/Skill</th>
                    <th style="text-align: center; padding: 6px; border: 1px solid #e2e8f0;">Count</th>
                    <th style="text-align: center; padding: 6px; border: 1px solid #e2e8f0;">Timing</th>
                  </tr>
                  ${task.labour.map((l: any) => {
                    const lName = l.labour_name || l.labourName || 'N/A';
                    const lIn = l.in_time || l.inTime || '-';
                    const lOut = l.out_time || l.outTime || '-';
                    return `
                    <tr>
                      <td style="padding: 6px; border: 1px solid #e2e8f0;">${lName}</td>
                      <td style="text-align: center; padding: 6px; border: 1px solid #e2e8f0;">${l.count}</td>
                      <td style="text-align: center; padding: 6px; border: 1px solid #e2e8f0;">${lIn} to ${lOut}</td>
                    </tr>
                  `}).join('')}
                </table>
              </div>
            ` : ''}

            ${task.issues && task.issues.length > 0 ? `
              <div style="background-color: #fff1f2; border: 1px solid #fecdd3; border-radius: 6px; padding: 12px; margin-top: 10px;">
                <h4 style="margin: 0 0 5px 0; font-size: 13px; color: #be123c;">Flagged Issues / Obstructions</h4>
                <ul style="margin: 0; padding-left: 20px; font-size: 13px; color: #9f1239;">
                  ${task.issues.map((issue: any) => `<li>${issue.description}</li>`).join('')}
                </ul>
              </div>
            ` : ''}

            ${task.media && task.media.length > 0 ? `
              <div style="margin-top: 15px;">
                <h4 style="margin: 0 0 8px 0; font-size: 13px; color: #64748b;">Media Documentation</h4>
                <div style="display: flex; flex-wrap: wrap; gap: 10px;">
                  ${task.media.map((m: any) => `
                    <div style="font-size: 12px; color: #2563eb;">
                      <a href="${m.fileUrl}" target="_blank" style="text-decoration: none; color: #2563eb; background: #eff6ff; padding: 5px 10px; border-radius: 4px; border: 1px solid #dbeafe;">
                        View ${m.fileType === 'video' ? 'Video' : 'Photo'}
                      </a>
                    </div>
                  `).join('')}
                </div>
              </div>
            ` : ''}
          </div>
        </div>
      `;
    });

    emailHtml += `
        <div style="margin-top: 40px; padding-top: 25px; border-top: 2px solid #e2e8f0; font-size: 12px; color: #94a3b8; text-align: center;">
          <p style="margin: 0;">This is a professional site report generated for <strong>${projectName}</strong>.</p>
          <p style="margin: 5px 0 0 0;">&copy; ${new Date().getFullYear()} BOQ Management System. All rights reserved.</p>
        </div>
      </div>
    `;

    const response = await resend.emails.send({
      from: fromEmail,
      to: Array.isArray(to) ? to : [to],
      subject: `Daily Site Report - ${projectName} - ${reportDate ? new Date(reportDate).toLocaleDateString() : ''}`,
      html: emailHtml,
    });

    return response;
  } catch (error) {
    console.error("[EMAIL ERROR] sendSiteReportEmail:", error);
    throw error;
  }
}
