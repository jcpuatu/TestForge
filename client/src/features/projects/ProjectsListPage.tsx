import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import * as projectsApi from '../../api/projects';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../../components/Button';
import { Field, Input, Label, Textarea } from '../../components/Input';
import { ApiError } from '../../lib/apiClient';

export function ProjectsListPage() {
  const { user } = useAuth();
  const canCreate = user?.role === 'ADMIN' || user?.role === 'LEAD';
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['projects'], queryFn: projectsApi.listProjects });

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);

  const createProject = useMutation({
    mutationFn: () => projectsApi.createProject({ name, description: description || undefined }),
    onSuccess: () => {
      setName('');
      setDescription('');
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Failed to create project'),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    createProject.mutate();
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-slate-900 dark:text-slate-100">Projects</h1>

      {canCreate && (
        <form onSubmit={handleSubmit} className="mb-8 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">New project</h2>
          <Field>
            <Label htmlFor="project-name">Name</Label>
            <Input id="project-name" required value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field>
            <Label htmlFor="project-description">Description</Label>
            <Textarea
              id="project-description"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>
          {error && <p className="mb-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
          <Button type="submit" disabled={createProject.isPending}>
            {createProject.isPending ? 'Creating…' : 'Create project'}
          </Button>
        </form>
      )}

      {isLoading && <p className="text-sm text-slate-500 dark:text-slate-400">Loading…</p>}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {data?.projects.map((project) => (
          <Link
            key={project.id}
            to={`/projects/${project.id}`}
            className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 transition-shadow hover:shadow-sm"
          >
            <h3 className="font-medium text-slate-900 dark:text-slate-100">{project.name}</h3>
            {project.description && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 line-clamp-2">{project.description}</p>}
            <p className="mt-3 text-xs text-slate-400 dark:text-slate-500">{project._count?.suites ?? 0} suites</p>
          </Link>
        ))}
        {data && data.projects.length === 0 && (
          <p className="text-sm text-slate-500 dark:text-slate-400">No projects yet. Create one to get started.</p>
        )}
      </div>
    </div>
  );
}
