import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as usersApi from '../../api/users';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../../components/Button';
import { Field, Input, Label } from '../../components/Input';
import { ApiError } from '../../lib/apiClient';

export function ApiKeysPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [label, setLabel] = useState('');
  const [rawKey, setRawKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const keysQuery = useQuery({
    queryKey: ['users', user?.id, 'api-keys'],
    queryFn: () => usersApi.listApiKeys(user!.id),
    enabled: !!user,
  });

  const createKey = useMutation({
    mutationFn: () => usersApi.createApiKey(user!.id, label),
    onSuccess: (data) => {
      setLabel('');
      setRawKey(data.apiKey.key);
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['users', user?.id, 'api-keys'] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Failed to create API key'),
  });

  const revokeKey = useMutation({
    mutationFn: (keyId: string) => usersApi.revokeApiKey(user!.id, keyId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users', user?.id, 'api-keys'] }),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    createKey.mutate();
  }

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold text-slate-900 dark:text-slate-100">API keys</h1>
      <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">
        Use an API key for programmatic access to the REST API (<code>Authorization: Bearer &lt;key&gt;</code>) — see{' '}
        <a href="http://localhost:4000/api/v1/docs" target="_blank" rel="noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">
          API docs
        </a>
        .
      </p>

      <form onSubmit={handleSubmit} className="mb-6 flex items-end gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
        <div className="flex-1">
          <Field>
            <Label htmlFor="key-label">Label</Label>
            <Input id="key-label" required placeholder="e.g. CI pipeline" value={label} onChange={(e) => setLabel(e.target.value)} />
          </Field>
        </div>
        <Button type="submit" disabled={createKey.isPending} className="mb-3">
          Generate key
        </Button>
      </form>
      {error && <p className="mb-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
      {rawKey && (
        <p className="mb-4 rounded-md bg-amber-50 dark:bg-amber-900/30 p-3 text-xs text-amber-800 dark:text-amber-300">
          New key (shown once, copy it now): <code className="font-mono">{rawKey}</code>
        </p>
      )}

      <div className="divide-y divide-slate-200 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
        {keysQuery.data?.apiKeys.map((k) => (
          <div key={k.id} className="flex items-center justify-between p-3">
            <div>
              <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{k.label}</p>
              <p className="font-mono text-xs text-slate-400 dark:text-slate-500">
                {k.keyPrefix}… · {k.revokedAt ? 'revoked' : k.lastUsedAt ? `last used ${new Date(k.lastUsedAt).toLocaleDateString()}` : 'never used'}
              </p>
            </div>
            {!k.revokedAt && (
              <button className="text-xs text-red-600 dark:text-red-400 hover:underline" onClick={() => revokeKey.mutate(k.id)}>
                Revoke
              </button>
            )}
          </div>
        ))}
        {keysQuery.data?.apiKeys.length === 0 && <p className="p-3 text-sm text-slate-500 dark:text-slate-400">No API keys yet.</p>}
      </div>
    </div>
  );
}
