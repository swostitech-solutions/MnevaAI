import { Resend } from 'resend'

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null
const FROM = process.env.RESEND_FROM || 'Mneva AI <onboarding@resend.dev>'

export async function sendOtpEmail(toEmail, toName, otp) {
  if (!resend) throw new Error('RESEND_API_KEY is not configured')
  const result = await resend.emails.send({
    from: FROM,
    to: toEmail,
    subject: `${otp} — Your Mneva AI verification code`,
    html: `
      <div style="font-family:'Segoe UI',sans-serif;max-width:480px;margin:0 auto;background:#0d0d0f;color:#e8e8f0;border-radius:16px;overflow:hidden;border:1px solid #1e1e2e">
        <div style="background:linear-gradient(135deg,#3D8BFF,#9B72FF);padding:28px 32px;text-align:center">
          <div style="display:inline-block;width:52px;height:52px;background:rgba(255,255,255,0.15);border-radius:14px;line-height:52px;font-size:24px;font-weight:700;color:#fff;margin-bottom:10px">M</div>
          <div style="font-size:22px;font-weight:700;color:#fff;letter-spacing:-0.5px">Mneva<span style="opacity:0.85">AI</span></div>
          <div style="font-size:12px;color:rgba(255,255,255,0.7);margin-top:4px;letter-spacing:0.08em;text-transform:uppercase">Your AI Chief of Staff</div>
        </div>
        <div style="padding:36px 32px">
          <p style="margin:0 0 8px;font-size:16px;font-weight:600;color:#e8e8f0">Hi ${toName.split(' ')[0]},</p>
          <p style="margin:0 0 28px;font-size:14px;color:#9090a8;line-height:1.6">Use the code below to verify your email address. It expires in <strong style="color:#e8e8f0">10 minutes</strong>.</p>
          <div style="background:#1a1a2e;border:1px solid #2a2a3e;border-radius:12px;padding:24px;text-align:center;margin-bottom:28px">
            <div style="font-size:38px;font-weight:700;letter-spacing:10px;color:#3D8BFF;font-family:monospace">${otp}</div>
          </div>
          <p style="margin:0;font-size:12px;color:#5a5a72;line-height:1.6">If you didn't create a Mneva AI account, you can safely ignore this email. Do not share this code with anyone.</p>
        </div>
        <div style="padding:16px 32px;border-top:1px solid #1e1e2e;text-align:center;font-size:11px;color:#3a3a52">
          Swostitech Solutions · Bengaluru, India
        </div>
      </div>
    `,
  })
  if (result.error) throw new Error(result.error.message || 'Resend error')
}

// Audit item G-05: the actual export delivery — a zip attachment straight
// to the user's own verified account email, same provider as the OTP
// mail above. A signed download link + separate temp-storage system would
// also work, but for a personal-data-sized zip an attachment is simpler
// and needs no extra infrastructure; Resend's own attachment size limit
// (40MB) is the practical ceiling here.
export async function sendAccountExportEmail(toEmail, toName, zipBuffer) {
  if (!resend) throw new Error('RESEND_API_KEY is not configured')
  const result = await resend.emails.send({
    from: FROM,
    to: toEmail,
    subject: 'Your Mneva AI data export',
    html: `
      <div style="font-family:'Segoe UI',sans-serif;max-width:480px;margin:0 auto;background:#0d0d0f;color:#e8e8f0;border-radius:16px;overflow:hidden;border:1px solid #1e1e2e">
        <div style="background:linear-gradient(135deg,#3D8BFF,#9B72FF);padding:28px 32px;text-align:center">
          <div style="display:inline-block;width:52px;height:52px;background:rgba(255,255,255,0.15);border-radius:14px;line-height:52px;font-size:24px;font-weight:700;color:#fff;margin-bottom:10px">M</div>
          <div style="font-size:22px;font-weight:700;color:#fff;letter-spacing:-0.5px">Mneva<span style="opacity:0.85">AI</span></div>
        </div>
        <div style="padding:36px 32px">
          <p style="margin:0 0 8px;font-size:16px;font-weight:600;color:#e8e8f0">Hi ${toName.split(' ')[0]},</p>
          <p style="margin:0 0 16px;font-size:14px;color:#9090a8;line-height:1.6">Your requested data export is attached as a zip file — it includes your tasks, finance records, family data, health log, documents list, Twin Diary ledger and chat history.</p>
          <p style="margin:0;font-size:12px;color:#5a5a72;line-height:1.6">Connected-account tokens and your password are never included. If you didn't request this, please contact support right away.</p>
        </div>
        <div style="padding:16px 32px;border-top:1px solid #1e1e2e;text-align:center;font-size:11px;color:#3a3a52">
          Swostitech Solutions · Bengaluru, India
        </div>
      </div>
    `,
    attachments: [{ filename: 'mneva-data-export.zip', content: zipBuffer }],
  })
  if (result.error) throw new Error(result.error.message || 'Resend error')
}

export async function sendPasswordResetEmail(toEmail, toName, otp) {
  if (!resend) throw new Error('RESEND_API_KEY is not configured')
  const result = await resend.emails.send({
    from: FROM,
    to: toEmail,
    subject: `${otp} — Reset your Mneva AI password`,
    html: `
      <div style="font-family:'Segoe UI',sans-serif;max-width:480px;margin:0 auto;background:#0d0d0f;color:#e8e8f0;border-radius:16px;overflow:hidden;border:1px solid #1e1e2e">
        <div style="background:linear-gradient(135deg,#3D8BFF,#9B72FF);padding:28px 32px;text-align:center">
          <div style="display:inline-block;width:52px;height:52px;background:rgba(255,255,255,0.15);border-radius:14px;line-height:52px;font-size:24px;font-weight:700;color:#fff;margin-bottom:10px">M</div>
          <div style="font-size:22px;font-weight:700;color:#fff;letter-spacing:-0.5px">Mneva<span style="opacity:0.85">AI</span></div>
          <div style="font-size:12px;color:rgba(255,255,255,0.7);margin-top:4px;letter-spacing:0.08em;text-transform:uppercase">Your AI Chief of Staff</div>
        </div>
        <div style="padding:36px 32px">
          <p style="margin:0 0 8px;font-size:16px;font-weight:600;color:#e8e8f0">Hi ${toName.split(' ')[0]},</p>
          <p style="margin:0 0 28px;font-size:14px;color:#9090a8;line-height:1.6">Use the code below to reset your password. It expires in <strong style="color:#e8e8f0">10 minutes</strong>.</p>
          <div style="background:#1a1a2e;border:1px solid #2a2a3e;border-radius:12px;padding:24px;text-align:center;margin-bottom:28px">
            <div style="font-size:38px;font-weight:700;letter-spacing:10px;color:#3D8BFF;font-family:monospace">${otp}</div>
          </div>
          <p style="margin:0;font-size:12px;color:#5a5a72;line-height:1.6">If you didn't request a password reset, you can safely ignore this email — your password will not change. Do not share this code with anyone.</p>
        </div>
        <div style="padding:16px 32px;border-top:1px solid #1e1e2e;text-align:center;font-size:11px;color:#3a3a52">
          Swostitech Solutions · Bengaluru, India
        </div>
      </div>
    `,
  })
  if (result.error) throw new Error(result.error.message || 'Resend error')
}
