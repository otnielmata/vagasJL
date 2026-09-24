import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

const control =
  'w-full rounded-xl border border-border bg-surface px-3.5 text-sm text-foreground placeholder:text-subtle ' +
  'transition-colors hover:border-border-strong focus:border-primary focus:outline-none focus:ring-4 focus:ring-ring ' +
  'disabled:opacity-60 aria-[invalid=true]:border-danger';

interface FieldShellProps {
  label?: ReactNode;
  hint?: ReactNode;
  error?: string;
  id: string;
  children: ReactNode;
  className?: string;
}

function FieldShell({ label, hint, error, id, children, className }: FieldShellProps) {
  return (
    <div className={cn('space-y-1.5', className)}>
      {label && (
        <label htmlFor={id} className="block text-sm font-medium text-foreground">
          {label}
        </label>
      )}
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-xs text-danger">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

type Common = { label?: ReactNode; hint?: ReactNode; error?: string; wrapperClassName?: string };

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & Common>(function Input(
  { label, hint, error, wrapperClassName, className, id, ...props },
  ref,
) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <FieldShell label={label} hint={hint} error={error} id={fid} className={wrapperClassName}>
      <input
        ref={ref}
        id={fid}
        aria-invalid={!!error}
        aria-describedby={error ? `${fid}-error` : undefined}
        className={cn(control, 'h-11', className)}
        {...props}
      />
    </FieldShell>
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & Common>(
  function Textarea({ label, hint, error, wrapperClassName, className, id, ...props }, ref) {
    const auto = useId();
    const fid = id ?? auto;
    return (
      <FieldShell label={label} hint={hint} error={error} id={fid} className={wrapperClassName}>
        <textarea ref={ref} id={fid} aria-invalid={!!error} className={cn(control, 'min-h-28 py-2.5', className)} {...props} />
      </FieldShell>
    );
  },
);

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & Common>(function Select(
  { label, hint, error, wrapperClassName, className, id, children, ...props },
  ref,
) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <FieldShell label={label} hint={hint} error={error} id={fid} className={wrapperClassName}>
      <select ref={ref} id={fid} aria-invalid={!!error} className={cn(control, 'h-11 pr-8', className)} {...props}>
        {children}
      </select>
    </FieldShell>
  );
});
