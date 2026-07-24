import { useState, type FormEvent } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import * as webhooksApi from '../../api/webhooks';
import type { WebhookEventType } from '../../api/webhooks';
import { Button } from '../../components/Button';
import { Badge } from '../../components/Badge';
import { Field, Input, Label, Select } from '../../components/Input';
import { LoadMoreButton } from '../../components/LoadMoreButton';
import { ApiError } from '../../lib/apiClient';

const EVENTS: WebhookEventType[] = ['RUN_COMPLETED', 'RUN_CREATED', 'CASE_CREATED'];

function WebhookRow({ webhook }: { webhook: webhooksApi.Webhook }) {
  const queryClient = useQueryClient();
  const [showLog, setShowLog] = useState(false);

  const deliveriesQuery = useInfiniteQuery({
    queryKey: ['webhooks', webhook.id, 'deliveries'],
    queryFn: ({ pageParam }) => webhooksApi.listDeliveries(webhook.id, pageParam),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.page + 1 : undefined),
    enabled: showLog,
  });
  const allDeliveries = deliveriesQuery.data?.pages.flatMap((p) => p.deliveries) ?? [];
  const deliveriesLastPage = deliveriesQuery.data?.pages[deliveriesQuery.data.pages.length - 1];

  const testMutation = useMutation({
    mutationFn: () => webhooksApi.testWebhook(webhook.id),
    onSuccess: () => {
      setShowLog(true);
      setTimeout(() => queryClient.invalidateQueries({ queryKey: ['webhooks', webhook.id, 'deliveries'] }), 500);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => webhooksApi.deleteWebhook(webhook.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects', webhook.projectId, 'webhooks'] }),
  });

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-mono text-sm text-slate-800 dark:text-slate-200">{webhook.url}</p>
          <Badge className="mt-1">{webhook.event}</Badge>
        </div>
        <div className="flex gap-3 text-xs">
          <button className="text-blue-600 dark:text-blue-400 hover:underline" onClick={() => testMutation.mutate()} disabled={testMutation.isPending}>
            Send test ping
          </button>
          <button className="text-blue-600 dark:text-blue-400 hover:underline" onClick={() => setShowLog((v) => !v)}>
            {showLog ? 'Hide log' : 'View log'}
          </button>
          <button className="text-red-600 dark:text-red-400 hover:underline" onClick={() => deleteMutation.mutate()}>
            Delete
          </button>
        </div>
      </div>

      {showLog && (
        <div className="mt-3 space-y-1 border-t border-slate-100 dark:border-slate-800 pt-3">
          {allDeliveries.map((d) => (
            <div key={d.id} className="flex items-center gap-2 text-xs">
              <Badge className={d.success ? 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300' : 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-400'}>
                {d.success ? 'OK' : 'FAILED'}
              </Badge>
              <span className="text-slate-500 dark:text-slate-400">{d.statusCode ?? '—'}</span>
              <span className="text-slate-400 dark:text-slate-500">{new Date(d.createdAt).toLocaleString()}</span>
            </div>
          ))}
          {allDeliveries.length === 0 && !deliveriesQuery.isLoading && <p className="text-xs text-slate-400 dark:text-slate-500">No deliveries yet.</p>}
          {deliveriesLastPage && (
            <LoadMoreButton
              loadedCount={allDeliveries.length}
              total={deliveriesLastPage.total}
              hasMore={deliveriesQuery.hasNextPage ?? false}
              isFetching={deliveriesQuery.isFetchingNextPage}
              onClick={() => deliveriesQuery.fetchNextPage()}
            />
          )}
        </div>
      )}
    </div>
  );
}

export function WebhooksTab() {
  const { projectId } = useParams<{ projectId: string }>();
  const queryClient = useQueryClient();

  const [url, setUrl] = useState('');
  const [event, setEvent] = useState<WebhookEventType>('RUN_COMPLETED');
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const webhooksQuery = useQuery({
    queryKey: ['projects', projectId, 'webhooks'],
    queryFn: () => webhooksApi.listWebhooks(projectId!),
  });

  const createWebhook = useMutation({
    mutationFn: () => webhooksApi.createWebhook(projectId!, { url, event }),
    onSuccess: (data) => {
      setUrl('');
      setCreatedSecret(data.webhook.secret ?? null);
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'webhooks'] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Failed to create webhook'),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    createWebhook.mutate();
  }

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold text-slate-900 dark:text-slate-100">Webhooks</h1>
      <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
        Outbound webhooks POST a signed JSON payload (HMAC-SHA256 in the <code>X-TestForge-Signature</code> header, computed over{' '}
        <code>{'{timestamp}.{body}'}</code>) to an external URL when project events occur — a stand-in integration point for
        Slack/Jira/CI notifications. The <code>X-TestForge-Timestamp</code> header carries the same timestamp; verify it's recent
        (e.g. within 5 minutes) before trusting a delivery, to guard against a captured payload being replayed later.
      </p>

      <form onSubmit={handleSubmit} className="mb-6 flex items-end gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
        <div className="flex-1">
          <Field>
            <Label htmlFor="webhook-url">Target URL</Label>
            <Input id="webhook-url" type="url" required placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} />
          </Field>
        </div>
        <div>
          <Field>
            <Label htmlFor="webhook-event">Event</Label>
            <Select id="webhook-event" value={event} onChange={(e) => setEvent(e.target.value as WebhookEventType)}>
              {EVENTS.map((ev) => (
                <option key={ev} value={ev}>
                  {ev}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Button type="submit" disabled={createWebhook.isPending} className="mb-3">
          Add webhook
        </Button>
      </form>
      {error && <p className="mb-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
      {createdSecret && (
        <p className="mb-4 rounded-md bg-amber-50 dark:bg-amber-900/30 p-3 text-xs text-amber-800 dark:text-amber-300">
          Signing secret (shown once): <code className="font-mono">{createdSecret}</code>
        </p>
      )}

      <div className="space-y-2">
        {webhooksQuery.data?.webhooks.map((webhook) => (
          <WebhookRow key={webhook.id} webhook={webhook} />
        ))}
        {webhooksQuery.data?.webhooks.length === 0 && <p className="text-sm text-slate-500 dark:text-slate-400">No webhooks configured yet.</p>}
      </div>
    </div>
  );
}
