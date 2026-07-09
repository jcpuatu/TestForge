import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Pencil, Trash2 } from 'lucide-react';
import * as projectsApi from '../../api/projects';
import type { Project } from '../../api/types';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../../components/Button';
import { Field, Input, Label, Textarea } from '../../components/Input';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { useToast } from '../../components/Toast';
import { ApiError } from '../../lib/apiClient';

function EditProjectForm({ project, onDone }: { project: Project; onDone: () => void }) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? '');
  const [error, setError] = useState<string | null>(null);

  const updateProject = useMutation({
    mutationFn: () => projectsApi.updateProject(project.id, { name, description: description || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      showToast('Project updated.');
      onDone();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Failed to update project'),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    updateProject.mutate();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4"
    >
      <Field>
        <Label htmlFor={`edit-project-name-${project.id}`}>Name</Label>
        <Input id={`edit-project-name-${project.id}`} required value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field>
        <Label htmlFor={`edit-project-description-${project.id}`}>Description</Label>
        <Textarea
          id={`edit-project-description-${project.id}`}
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>
      {error && <p className="mb-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" disabled={updateProject.isPending}>
          {updateProject.isPending ? 'Saving…' : 'Save'}
        </Button>
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function ProjectsListPage() {
  const { user } = useAuth();
  const canCreate = user?.role === 'ADMIN' || user?.role === 'LEAD';
  const canEdit = canCreate;
  const canDelete = user?.role === 'ADMIN';
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { data, isLoading } = useQuery({ queryKey: ['projects'], queryFn: projectsApi.listProjects });

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);

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

  const deleteImpactQuery = useQuery({
    queryKey: ['projects', deleteTarget?.id, 'delete-impact'],
    queryFn: () => projectsApi.getProjectDeleteImpact(deleteTarget!.id),
    enabled: !!deleteTarget,
  });

  const deleteProject = useMutation({
    mutationFn: () => projectsApi.deleteProject(deleteTarget!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      showToast('Project deleted.');
      setDeleteTarget(null);
    },
    onError: (err) => showToast(err instanceof ApiError ? err.message : 'Failed to delete project', 'error'),
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
        {data?.projects.map((project) =>
          editingProjectId === project.id ? (
            <EditProjectForm key={project.id} project={project} onDone={() => setEditingProjectId(null)} />
          ) : (
            <div key={project.id} className="group relative">
              <Link
                to={`/projects/${project.id}`}
                className="block rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 transition-shadow hover:shadow-sm"
              >
                <h3 className="pr-12 font-medium text-slate-900 dark:text-slate-100">{project.name}</h3>
                {project.description && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 line-clamp-2">{project.description}</p>}
                <p className="mt-3 text-xs text-slate-400 dark:text-slate-500">{project._count?.suites ?? 0} suites</p>
              </Link>
              {(canEdit || canDelete) && (
                <div className="absolute right-3 top-3 flex gap-1 opacity-0 group-hover:opacity-100">
                  {canEdit && (
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        setEditingProjectId(project.id);
                      }}
                      aria-label="Edit project"
                      className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:text-slate-500 dark:hover:bg-slate-700 dark:hover:text-slate-300"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {canDelete && (
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        setDeleteTarget(project);
                      }}
                      aria-label="Delete project"
                      className="rounded p-1 text-slate-400 hover:bg-red-100 hover:text-red-600 dark:text-slate-500 dark:hover:bg-red-900/50 dark:hover:text-red-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              )}
            </div>
          ),
        )}
        {data && data.projects.length === 0 && (
          <p className="text-sm text-slate-500 dark:text-slate-400">No projects yet. Create one to get started.</p>
        )}
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteProject.mutate()}
        title={`Delete "${deleteTarget?.name}"?`}
        confirmLabel="Delete project"
        confirming={deleteProject.isPending}
        message={
          deleteImpactQuery.data ? (
            <>
              This permanently deletes <strong>{deleteImpactQuery.data.suiteCount}</strong> suite(s),{' '}
              <strong>{deleteImpactQuery.data.caseCount}</strong> test case(s),{' '}
              <strong>{deleteImpactQuery.data.runCount}</strong> test run(s),{' '}
              <strong>{deleteImpactQuery.data.planCount}</strong> plan(s), and{' '}
              <strong>{deleteImpactQuery.data.milestoneCount}</strong> milestone(s). This cannot be undone.
            </>
          ) : (
            'Loading impact…'
          )
        }
      />
    </div>
  );
}
