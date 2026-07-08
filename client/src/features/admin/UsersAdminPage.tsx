import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as usersApi from '../../api/users';
import type { Role } from '../../api/types';
import { Button } from '../../components/Button';
import { Badge } from '../../components/Badge';
import { Field, Input, Label, Select } from '../../components/Input';
import { ApiError } from '../../lib/apiClient';

const ROLES: Role[] = ['ADMIN', 'LEAD', 'TESTER', 'VIEWER'];

export function UsersAdminPage() {
  const queryClient = useQueryClient();
  const usersQuery = useQuery({ queryKey: ['users'], queryFn: usersApi.listUsers });

  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('TESTER');
  const [error, setError] = useState<string | null>(null);

  const createUser = useMutation({
    mutationFn: () => usersApi.createUser({ email, name, password, role }),
    onSuccess: () => {
      setEmail('');
      setName('');
      setPassword('');
      setRole('TESTER');
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Failed to create user'),
  });

  const updateUser = useMutation({
    mutationFn: (vars: { id: string; role?: Role; isActive?: boolean }) => usersApi.updateUser(vars.id, vars),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    createUser.mutate();
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-slate-900 dark:text-slate-100">Users</h1>
      <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
        TestForge is admin-provisioned — there is no public self-registration, matching real TestRail's model.
      </p>

      <form onSubmit={handleSubmit} className="mb-6 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">Create user</h2>
        <div className="grid grid-cols-2 gap-3">
          <Field>
            <Label htmlFor="user-name">Name</Label>
            <Input id="user-name" required value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field>
            <Label htmlFor="user-email">Email</Label>
            <Input id="user-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field>
            <Label htmlFor="user-password">Temporary password</Label>
            <Input id="user-password" type="text" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <Field>
            <Label htmlFor="user-role">Role</Label>
            <Select id="user-role" value={role} onChange={(e) => setRole(e.target.value as Role)}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        {error && <p className="mb-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
        <Button type="submit" disabled={createUser.isPending}>
          Create user
        </Button>
      </form>

      <div className="divide-y divide-slate-200 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
        {usersQuery.data?.users.map((u) => (
          <div key={u.id} className="flex items-center justify-between p-3">
            <div>
              <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                {u.name} <span className="font-normal text-slate-400 dark:text-slate-500">· {u.email}</span>
              </p>
              {!u.isActive && <Badge className="mt-1 bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400">Inactive</Badge>}
            </div>
            <div className="flex items-center gap-2">
              <Select
                value={u.role}
                onChange={(e) => updateUser.mutate({ id: u.id, role: e.target.value as Role })}
                className="w-32 py-1 text-xs"
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </Select>
              <button
                className="text-xs text-red-600 dark:text-red-400 hover:underline"
                onClick={() => updateUser.mutate({ id: u.id, isActive: !u.isActive })}
              >
                {u.isActive ? 'Deactivate' : 'Reactivate'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
