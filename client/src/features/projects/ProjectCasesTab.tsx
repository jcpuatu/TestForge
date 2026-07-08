import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useOutletContext, useParams } from 'react-router-dom';
import * as suitesApi from '../../api/suites';
import type { Project, Suite } from '../../api/types';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../../components/Button';
import { Field, Input, Label } from '../../components/Input';
import { ApiError } from '../../lib/apiClient';

type Context = { project: Project & { suites: Suite[] } };

export function ProjectCasesTab() {
  const { projectId } = useParams<{ projectId: string }>();
  const { project } = useOutletContext<Context>();
  const { user } = useAuth();
  const canManage = user?.role === 'ADMIN' || user?.role === 'LEAD';
  const queryClient = useQueryClient();

  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const createSuite = useMutation({
    mutationFn: () => suitesApi.createSuite(projectId!, { name }),
    onSuccess: () => {
      setName('');
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['projects', projectId] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Failed to create suite'),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    createSuite.mutate();
  }

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold text-slate-900 dark:text-slate-100">Test Cases</h1>
      {canManage && (
        <form onSubmit={handleSubmit} className="mb-6 flex items-end gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
          <div className="flex-1">
            <Field>
              <Label htmlFor="suite-name">New suite name</Label>
              <Input id="suite-name" required value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
          </div>
          <Button type="submit" disabled={createSuite.isPending} className="mb-3">
            {createSuite.isPending ? 'Creating…' : 'Add suite'}
          </Button>
        </form>
      )}
      {error && <p className="mb-3 text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div className="space-y-2">
        {project.suites.map((suite) => (
          <Link
            key={suite.id}
            to={`/suites/${suite.id}`}
            className="block rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 hover:shadow-sm"
          >
            <h3 className="font-medium text-slate-900 dark:text-slate-100">{suite.name}</h3>
            {suite.description && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{suite.description}</p>}
          </Link>
        ))}
        {project.suites.length === 0 && <p className="text-sm text-slate-500 dark:text-slate-400">No test suites yet.</p>}
      </div>
    </div>
  );
}
