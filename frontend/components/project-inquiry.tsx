'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { estimate, usd, type Discovery } from '@/lib/estimate';
import styles from './project-inquiry.module.css';

export type InquiryEndpoint = '/api/contact' | '/api/inquiries';

type Props = {
  endpoint: InquiryEndpoint | null;
  email: string;
  discovery: Discovery | null;
  onRemoveEstimate: () => void;
};

const emptyBrief = { name: '', email: '', company: '', overview: '' };
const failedConfirmation = 'We couldn’t confirm that your message was received. Try again or email us directly.';

export function ProjectInquiry({ endpoint, email, discovery, onRemoveEstimate }: Props) {
  const [brief, setBrief] = useState(emptyBrief);
  const [website, setWebsite] = useState('');
  const [consent, setConsent] = useState(false);
  const [pending, setPending] = useState(false);
  const [reference, setReference] = useState('');
  const [feedback, setFeedback] = useState<{ message: string; error: boolean } | null>(null);
  const attempt = useRef<{ body: string; id: string } | null>(null);
  const inFlight = useRef(false);
  const confirmation = useRef<HTMLHeadingElement>(null);
  const nameField = useRef<HTMLInputElement>(null);
  const detailsField = useRef<HTMLTextAreaElement>(null);
  const attachedEstimate = discovery ? estimate(discovery) : null;
  const estimateRange = attachedEstimate ? usd(attachedEstimate.low) + '–' + usd(attachedEstimate.high) + ' USD' : '';

  useEffect(() => {
    if (reference) confirmation.current?.focus();
  }, [reference]);

  function reportError(message: string) {
    setFeedback({ message, error: true });
  }

  function update(field: keyof typeof emptyBrief, value: string) {
    setBrief(current => ({ ...current, [field]: value }));
  }

  function downloadBrief() {
    const lines = [
      'Cedar & Cursor — Project brief', '',
      'Name: ' + brief.name.trim(),
      'Email: ' + brief.email.trim(),
      'Company: ' + (brief.company.trim() || 'Not provided'), '',
      'Project details', brief.overview.trim(),
    ];
    if (attachedEstimate) {
      lines.push(
        '', 'Project planner estimate (indicative only)', attachedEstimate.project,
        'Priority: ' + attachedEstimate.goal,
        'Features: ' + (attachedEstimate.features.join(', ') || 'Core scope only'),
        'Stage: ' + attachedEstimate.stage,
        'Range: ' + estimateRange,
        'Recommendation: ' + attachedEstimate.recommendation,
      );
    }

    const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' }));
    const download = document.createElement('a');
    download.href = url;
    download.download = 'cedar-cursor-project-brief.txt';
    download.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setFeedback({ message: 'Your brief is ready. Attach it to your email to the studio.', error: false });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || reference) return;
    if (!brief.name.trim()) {
      reportError('Enter your name so we know who to reply to.');
      nameField.current?.focus();
      return;
    }
    if (brief.overview.trim().length < 10) {
      reportError('Write a short description of what you’d like to build or improve.');
      detailsField.current?.focus();
      return;
    }
    if (!endpoint) {
      downloadBrief();
      return;
    }
    if (!consent) {
      reportError('Confirm that we can email you about this project.');
      return;
    }

    const fields = { ...brief, discovery, consent, website };
    const body = JSON.stringify(fields);
    if (attempt.current?.body !== body) attempt.current = { body, id: crypto.randomUUID() };
    inFlight.current = true;
    setPending(true);
    setFeedback(null);
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...fields, requestId: attempt.current.id }),
      });
      const data: { reference?: unknown; error?: unknown } | null = await response.json();
      if (!response.ok || typeof data?.reference !== 'string' || !data.reference.trim()) {
        reportError(typeof data?.error === 'string' && data.error.trim() ? data.error : failedConfirmation);
        return;
      }
      setReference(data.reference);
      onRemoveEstimate();
    } catch {
      reportError(failedConfirmation);
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  function startAgain() {
    setBrief(emptyBrief);
    setConsent(false);
    setWebsite('');
    setReference('');
    setFeedback(null);
    attempt.current = null;
    requestAnimationFrame(() => nameField.current?.focus());
  }

  return <section id="contact" className={styles.section} aria-labelledby="project-contact-title">
    <div className={'wrap ' + styles.layout}>
      <div className={styles.intro}>
        <h2 id="project-contact-title">Tell us about<br className={styles.titleBreak} /> your project.</h2>
        <p>Planning a website, custom software, or an automation? A few lines about what you want to build or improve are enough to start.</p>
        <div className={styles.next}>
          <h3>What happens next</h3>
          <p>{endpoint
            ? 'We’ll review your message and reply by email with any questions and a suggested next step.'
            : 'Email us your project details. We’ll review them and reply with a suggested next step.'}</p>
        </div>
        <div className={styles.email}>
          <span>{endpoint ? 'Prefer email?' : 'Email the studio'}</span>
          <a href={'mailto:' + email}>{email}<span aria-hidden="true">↗</span></a>
        </div>
      </div>

      {reference ? <div className={styles.paper + ' ' + styles.confirmation}>
        <span className={styles.check} aria-hidden="true">✓</span>
        <h3 ref={confirmation} tabIndex={-1}>Message received</h3>
        <p>We’ll review your project and reply to <strong>{brief.email.trim()}</strong>.</p>
        <p className={styles.reference}>Reference <code>{reference}</code></p>
        <button className={styles.textButton} type="button" onClick={startAgain}>Send another message <span aria-hidden="true">↗</span></button>
      </div> : <form className={styles.paper} aria-labelledby="project-inquiry-heading" onSubmit={submit}>
        <h3 id="project-inquiry-heading">{endpoint ? 'Project inquiry' : 'Prepare a project brief'}</h3>
        {!endpoint && <p className={styles.offline}>Fill this in to download a brief you can attach to your email.</p>}
        <fieldset className={styles.fields} disabled={pending}>
          {endpoint && <div hidden aria-hidden="true">
            <label>Website<input name="website" tabIndex={-1} autoComplete="off" value={website} onChange={event => setWebsite(event.target.value)} /></label>
          </div>}
          <div className={styles.contactRow}>
            <label className={styles.field}>Your name
              <input ref={nameField} name="name" required autoComplete="name" maxLength={120} value={brief.name} onChange={event => update('name', event.target.value)} />
            </label>
            <label className={styles.field}>Email
              <input name="email" type="email" required autoComplete="email" maxLength={254} value={brief.email} onChange={event => update('email', event.target.value)} />
            </label>
          </div>
          <label className={styles.field}><span>Company <span className={styles.optional}>(optional)</span></span>
            <input name="company" autoComplete="organization" maxLength={160} value={brief.company} onChange={event => update('company', event.target.value)} />
          </label>
          <div className={styles.field}>
            <label htmlFor="project-inquiry-overview">Project details</label>
            <p id="project-inquiry-hint" className={styles.hint}>Share a goal, a link, or a target date if you have one.</p>
            <textarea
              ref={detailsField} id="project-inquiry-overview" name="overview" aria-describedby="project-inquiry-hint"
              required minLength={10} maxLength={5000} rows={4}
              placeholder="For example, we need a site that makes it easier for customers to request a quote."
              value={brief.overview} onChange={event => update('overview', event.target.value)}
            />
          </div>
          <div className={styles.estimateNotice} aria-live="polite">
            {attachedEstimate && <div className={styles.estimate}>
              <div><strong>Estimate attached</strong><p>{attachedEstimate.project} · {estimateRange}</p></div>
              <button type="button" className={styles.textButton} onClick={onRemoveEstimate}>Remove estimate</button>
            </div>}
          </div>
          {endpoint && <div className={styles.privacy}>
            <label className={styles.consent}>
              <input name="consent" type="checkbox" required checked={consent} onChange={event => setConsent(event.target.checked)} />
              <span>You may email me about this project.</span>
            </label>
            <a href="/privacy" target="_blank" rel="noreferrer">Privacy policy</a>
          </div>}
          <button className={styles.submit} type="submit">
            {endpoint ? pending ? 'Sending…' : 'Send project inquiry' : 'Download project brief'}
            {!pending && <span aria-hidden="true">{endpoint ? '↗' : '↓'}</span>}
          </button>
        </fieldset>
        {feedback && <p className={feedback.error ? styles.error : styles.feedback} role={feedback.error ? 'alert' : 'status'}>{feedback.message}</p>}
      </form>}
    </div>
  </section>;
}
