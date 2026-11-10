// Server only. Sends email from the app's own address, through Cloudflare
// Email Sending in the owner's Cloudflare account. Call it inside server
// functions and loaders, never from the browser.
//
// The owner sets email up in the Shipyard dashboard (the project's Email
// tab). From the next deploy, Shipyard binds EMAIL (send_email, allowed to
// send only from the app's address) and sets EMAIL_FROM and
// EMAIL_FROM_NAME. Locally, and before that, sendEmail() prints the email to
// the server log instead of sending it.
//
// Send only to people the app has a reason to email: the signed-in user, or
// the owner. Never send to any address a visitor types into a form, or the
// app becomes a way to send spam from the owner's domain.
import { env } from 'cloudflare:workers'

interface EmailEnv {
  EMAIL?: SendEmail
  EMAIL_FROM?: string
  EMAIL_FROM_NAME?: string
}

const mail = () => env as unknown as EmailEnv

export interface Email {
  // One address, or up to 50.
  to: string | string[]
  subject: string
  // At least one of html and text. Escape anything a visitor wrote.
  html?: string
  text?: string
  replyTo?: string
}

export interface SentEmail {
  // False when email is not set up (or locally): it was printed, not sent.
  sent: boolean
  messageId: string | null
}

// Whether the app can send email yet (set up in Shipyard, then deployed).
export function canSendEmail(): boolean {
  return Boolean(mail().EMAIL && mail().EMAIL_FROM)
}

const ADDRESS = /^[^\s@<>()",;]{1,64}@[^\s@<>()",;]{1,253}$/

export async function sendEmail(email: Email): Promise<SentEmail> {
  const to = Array.isArray(email.to) ? email.to : [email.to]
  if (!to.length || to.length > 50 || !to.every((a) => ADDRESS.test(a))) {
    throw new Error('sendEmail: "to" must be 1 to 50 email addresses.')
  }
  const subject = email.subject.replace(/[\r\n]+/g, ' ').trim()
  if (!subject) throw new Error('sendEmail: "subject" is required.')
  if (!email.html && !email.text) throw new Error('sendEmail: give "html", "text", or both.')

  const { EMAIL, EMAIL_FROM, EMAIL_FROM_NAME } = mail()
  if (!EMAIL || !EMAIL_FROM) {
    console.info(`[email not set up] would send "${subject}" to ${to.length} recipient(s). Set up email in the Shipyard dashboard, then deploy.`)
    return { sent: false, messageId: null }
  }
  try {
    const result = await EMAIL.send({
      to,
      from: EMAIL_FROM_NAME ? { email: EMAIL_FROM, name: EMAIL_FROM_NAME } : EMAIL_FROM,
      subject,
      ...(email.html ? { html: email.html } : {}),
      ...(email.text ? { text: email.text } : {}),
      ...(email.replyTo ? { replyTo: email.replyTo } : {}),
    })
    return { sent: true, messageId: result.messageId ?? null }
  } catch (err) {
    // Cloudflare's codes, for example E_RECIPIENT_SUPPRESSED (the address
    // bounced or complained before) or E_DAILY_LIMIT_EXCEEDED.
    const code = (err as { code?: string }).code ?? /\bE_[A-Z_]+\b/.exec(String((err as Error).message))?.[0] ?? 'E_UNKNOWN'
    throw new Error(`sendEmail: Cloudflare Email Sending refused the email (${code}).`, { cause: err })
  }
}
