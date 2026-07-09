import type { InputHTMLAttributes, LabelHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { ChevronDown } from 'lucide-react';
import clsx from 'clsx';

const FIELD_CLASSES =
  'w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500';

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={clsx(FIELD_CLASSES, className)} {...props} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={clsx(FIELD_CLASSES, className)} {...props} />;
}

// Native <select> arrows are drawn by the browser inside the existing padding box, with no
// guaranteed clearance — long option text (or a narrow/text-xs instance) can render under it.
// appearance-none removes the native arrow entirely and a manually-positioned icon replaces it,
// so overlap can't happen regardless of content length, width, or browser.
export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select
        className={clsx(FIELD_CLASSES, 'appearance-none bg-white pr-8 dark:bg-slate-800', className)}
        {...props}
      />
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
    </div>
  );
}

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={clsx('mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400', className)} {...props} />;
}

export function Field({ children }: { children: ReactNode }) {
  return <div className="mb-3">{children}</div>;
}
