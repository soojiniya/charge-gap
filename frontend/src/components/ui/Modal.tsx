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

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab' && ref.current) {
        const nodes = ref.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, [tabindex]:not([tabindex="-1"])',
        );
        if (!nodes.length) return;
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, [onClose]);

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
