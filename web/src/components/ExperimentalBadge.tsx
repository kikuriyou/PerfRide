import type { ReactNode } from 'react';

type ExperimentalBadgeProps = {
  compact?: boolean;
  className?: string;
};

export default function ExperimentalBadge({
  compact = false,
  className = '',
}: ExperimentalBadgeProps) {
  return (
    <span
      className={`experimental-badge${compact ? ' experimental-badge--compact' : ''}${
        className ? ` ${className}` : ''
      }`}
      title="Experimental feature"
      aria-label="Experimental feature"
    >
      {compact ? 'Exp' : 'Experimental'}
    </span>
  );
}

type ExperimentalNoticeProps = {
  children?: ReactNode;
};

export function ExperimentalNotice({ children }: ExperimentalNoticeProps) {
  return (
    <div className="experimental-notice" role="note">
      <span className="experimental-notice__icon" aria-hidden="true">
        ⚠️
      </span>
      <span>
        {children ??
          'This tool is experimental. Results are estimates based on simplified models and should be used as reference only.'}
      </span>
    </div>
  );
}
