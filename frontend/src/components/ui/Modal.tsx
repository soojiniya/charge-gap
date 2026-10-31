import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';

interface Props {
  title: ReactNode;
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  tabs?: ReactNode;
}

/** 접근성: role=dialog, Esc로 닫기, 열릴 때 포커스 이동, 닫힐 때 원래 위치로 복귀, Tab 순환 */
export function Modal({ title, subtitle, onClose, children, tabs }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const previous = document.activeElement as HTMLElement | null;
    const background = Array.from(document.body.children)
      .filter((el): el is HTMLElement => el instanceof HTMLElement && el !== dialog.parentElement)
      .map((el) => ({ el, inert: el.inert }));
    background.forEach(({ el }) => { el.inert = true; });
    const focusable = () => Array.from(dialog.querySelectorAll<HTMLElement>(
      'a[href], button, input, select, textarea, [tabindex], [contenteditable="true"]',
    )).filter(el => el.tabIndex >= 0 && !el.matches(':disabled, input[type="hidden"]')
      && !el.closest('[hidden], [inert]') && el.getClientRects().length > 0
      && getComputedStyle(el).visibility === 'visible');
    const focusFirst = () => (focusable()[0] ?? dialog).focus();
    focusFirst();
    const onKey = (e: KeyboardEvent) => {
      if (dialog.closest('[inert]')) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        closeRef.current();
      }
      if (e.key === 'Tab') {
        const nodes = focusable();
        if (!nodes.length) { e.preventDefault(); dialog.focus(); return; }
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        const outside = !nodes.includes(document.activeElement as HTMLElement);
        if (e.shiftKey && (document.activeElement === first || outside)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && (document.activeElement === last || outside)) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    const onFocus = (e: FocusEvent) => {
      if (!dialog.closest('[inert]') && !dialog.contains(e.target as Node)) focusFirst();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('focusin', onFocus);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('focusin', onFocus);
      document.body.style.overflow = overflow;
      background.forEach(({ el, inert }) => { el.inert = inert; });
      if (previous?.isConnected) previous.focus();
    };
  }, []);

  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" tabIndex={-1} ref={ref}>
        <div className="modal-head">
          <div>
            <h2 className="modal-title" id="modal-title">
              {title}
            </h2>
            {subtitle && <div className="card-sub">{subtitle}</div>}
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="닫기">
            <Icon name="close" />
          </button>
        </div>
        {tabs}
        <div className="modal-body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
