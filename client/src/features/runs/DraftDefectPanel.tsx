import { useState } from 'react';
import type { RunCase, TestRun } from '../../api/runs';
import { Button } from '../../components/Button';
import { Field, Input, Label } from '../../components/Input';

const JIRA_URL_STORAGE_KEY = 'testforge:jiraCreateUrl';
// Gates both the button's visibility and the actual window.open call — the saved value is
// user-typed, browser-local free text with no server-side validation anywhere in this app, so a
// javascript:-scheme or otherwise malformed value must never reach window.open unchecked.
const JIRA_URL_PATTERN = /^https?:\/\//i;

function buildDraft(test: RunCase, run: TestRun, comment: string | undefined, reporterName: string | undefined): { title: string; description: string } {
  const title = `[${run.name}] ${test.titleSnapshot}`;
  const lines: string[] = [`Environment: ${run.suite?.name ?? ''} / ${run.name}`];

  if (test.stepsSnapshot && test.stepsSnapshot.length > 0) {
    lines.push('', 'Steps to Reproduce:');
    test.stepsSnapshot.forEach((s, i) => lines.push(`${i + 1}. ${s.step}${s.expected ? ` (expected: ${s.expected})` : ''}`));
  }
  if (test.expectedSnapshot) {
    lines.push('', 'Expected Result:', test.expectedSnapshot);
  }
  if (comment) {
    lines.push('', 'Actual Result:', comment);
  }
  lines.push('', `Reported by: ${reporterName ?? 'Unknown'}, ${new Date().toLocaleString()}`);
  lines.push(`Reference: ${window.location.origin}/runs/${run.id}`);

  return { title, description: lines.join('\n') };
}

export function DraftDefectPanel({
  test,
  run,
  draftComment,
  reporterName,
  onClose,
}: {
  test: RunCase;
  run: TestRun;
  draftComment: string | undefined;
  reporterName: string | undefined;
  onClose: () => void;
}) {
  const { title, description } = buildDraft(test, run, draftComment, reporterName);
  const [jiraUrl, setJiraUrl] = useState(() => localStorage.getItem(JIRA_URL_STORAGE_KEY) ?? '');
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(`${title}\n\n${description}`).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function handleSaveJiraUrl(url: string) {
    setJiraUrl(url);
    localStorage.setItem(JIRA_URL_STORAGE_KEY, url);
  }

  function handleOpenInJira() {
    if (!jiraUrl || !JIRA_URL_PATTERN.test(jiraUrl)) return;
    const params = new URLSearchParams({ summary: title, description });
    const separator = jiraUrl.includes('?') ? '&' : '?';
    window.open(`${jiraUrl}${separator}${params.toString()}`, '_blank', 'noopener');
  }

  return (
    <div className="rounded-md border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/30 p-3">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-blue-800 dark:text-blue-300">Draft defect for Jira</h4>
        <button className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300" onClick={onClose}>
          Close
        </button>
      </div>
      <p className="mb-1 text-xs font-medium text-slate-600 dark:text-slate-400">Title</p>
      <p className="mb-2 rounded bg-white dark:bg-slate-800 p-2 text-xs text-slate-800 dark:text-slate-200">{title}</p>
      <p className="mb-1 text-xs font-medium text-slate-600 dark:text-slate-400">Description</p>
      <pre className="mb-3 whitespace-pre-wrap rounded bg-white dark:bg-slate-800 p-2 font-sans text-xs text-slate-800 dark:text-slate-200">{description}</pre>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" onClick={handleCopy}>
          {copied ? 'Copied!' : 'Copy to clipboard'}
        </Button>
        {jiraUrl && JIRA_URL_PATTERN.test(jiraUrl) && (
          <Button variant="secondary" onClick={handleOpenInJira}>
            Open in Jira
          </Button>
        )}
      </div>

      <details className="mt-3">
        <summary className="cursor-pointer text-xs text-slate-500 dark:text-slate-400">
          {jiraUrl ? 'Change' : 'Set'} your Jira "Create Issue" URL (saved locally in this browser)
        </summary>
        <div className="mt-2">
          <Field>
            <Label htmlFor={`jira-url-${test.id}`}>Jira create-issue URL</Label>
            <Input
              id={`jira-url-${test.id}`}
              placeholder="https://yourorg.atlassian.net/secure/CreateIssueDetails!init.jspa?pid=10000&issuetype=1"
              value={jiraUrl}
              onChange={(e) => handleSaveJiraUrl(e.target.value)}
            />
          </Field>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Works reliably on Jira Server/Data Center. Newer Jira Cloud UIs may not honor the pre-fill — copy/paste
            still works either way.
          </p>
        </div>
      </details>
    </div>
  );
}
