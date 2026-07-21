import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Check, ChevronDown, MessageSquare, X } from 'lucide-react';
import { useUserStore, type FeedbackSubmission } from '../../store/userStore';
import styles from './FeedbackModal.module.css';

interface FeedbackModalProps {
  onClose: () => void;
}

const FEEDBACK_TYPES: Array<{ value: FeedbackSubmission['type']; label: string }> = [
  { value: 'general', label: 'General feedback' },
  { value: 'bug', label: 'Bug report' },
  { value: 'feature', label: 'Feature request' },
];

export default function FeedbackModal({ onClose }: FeedbackModalProps) {
  const { submitFeedback, user } = useUserStore();
  const [type, setType] = useState<FeedbackSubmission['type']>('general');
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState(user?.email || '');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [isTypeOpen, setIsTypeOpen] = useState(false);
  const selectRef = useRef<HTMLDivElement>(null);
  const selectedTypeLabel = FEEDBACK_TYPES.find((option) => option.value === type)?.label;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || status === 'submitting') return;
      if (isTypeOpen) {
        setIsTypeOpen(false);
      } else {
        onClose();
      }
    };
    const onMouseDown = (event: MouseEvent) => {
      if (!selectRef.current?.contains(event.target as Node)) setIsTypeOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('mousedown', onMouseDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('mousedown', onMouseDown);
    };
  }, [isTypeOpen, onClose, status]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setStatus('submitting');
    try {
      await submitFeedback({ type, message, email });
      setStatus('sent');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Could not send feedback.');
      setStatus('idle');
    }
  };

  return (
    <div className={styles.overlay} onMouseDown={status === 'submitting' ? undefined : onClose}>
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="feedback-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button className={styles.closeBtn} onClick={onClose} aria-label="Close feedback form">
          <X size={22} />
        </button>

        {status === 'sent' ? (
          <div className={styles.success}>
            <MessageSquare size={32} />
            <h2 id="feedback-title">Thank you!</h2>
            <p>Your feedback has been sent.</p>
            <button className={styles.submitBtn} onClick={onClose}>Done</button>
          </div>
        ) : (
          <>
            <h2 id="feedback-title" className={styles.title}>Send feedback</h2>
            <p className={styles.description}>Share an idea, report a bug, or tell us what you think.</p>
            <form className={styles.form} onSubmit={handleSubmit}>
              <div className={styles.formField}>
                <span className={styles.fieldLabel} id="feedback-type-label">Type</span>
                <div className={styles.selectWrapper} ref={selectRef}>
                  <button
                    className={`${styles.selectTrigger} ${isTypeOpen ? styles.selectTriggerOpen : ''}`}
                    type="button"
                    aria-haspopup="listbox"
                    aria-expanded={isTypeOpen}
                    aria-labelledby="feedback-type-label feedback-type-value"
                    onClick={() => setIsTypeOpen((open) => !open)}
                    onKeyDown={(event) => {
                      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                        event.preventDefault();
                        setIsTypeOpen(true);
                      }
                    }}
                  >
                    <span id="feedback-type-value">{selectedTypeLabel}</span>
                    <ChevronDown size={18} aria-hidden="true" />
                  </button>
                  {isTypeOpen && (
                    <div className={styles.selectMenu} role="listbox" aria-labelledby="feedback-type-label">
                      {FEEDBACK_TYPES.map((option) => (
                        <button
                          className={`${styles.selectOption} ${option.value === type ? styles.selectOptionSelected : ''}`}
                          type="button"
                          role="option"
                          aria-selected={option.value === type}
                          key={option.value}
                          onClick={() => {
                            setType(option.value);
                            setIsTypeOpen(false);
                          }}
                        >
                          <span>{option.label}</span>
                          {option.value === type && <Check size={17} aria-hidden="true" />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <label>
                Feedback
                <textarea
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  placeholder="I need more bananas."
                  maxLength={2000}
                  rows={6}
                  required
                  autoFocus
                />
              </label>
              <label>
                Email <span>(optional)</span>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  maxLength={320}
                />
              </label>
              {error && <div className={styles.error} role="alert">{error}</div>}
              <button className={styles.submitBtn} type="submit" disabled={status === 'submitting' || !message.trim()}>
                {status === 'submitting' ? 'Sending…' : 'Send feedback'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
