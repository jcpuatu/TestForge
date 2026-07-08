import { useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import * as suitesApi from '../../api/suites';
import * as casesApi from '../../api/cases';
import type { CaseInput } from '../../api/cases';
import type { Section, TestCase } from '../../api/types';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../../components/Button';
import { Field, Input, Label, Select } from '../../components/Input';
import { PriorityBadge, Badge } from '../../components/Badge';
import { CaseForm } from './CaseForm';
import { ApiError } from '../../lib/apiClient';
import { downloadCasesCsv, importCasesCsv } from '../../api/csv';

function buildIndentedSections(sections: Section[]): Array<Section & { depth: number }> {
  const byParent = new Map<string | null, Section[]>();
  for (const s of sections) {
    const key = s.parentId;
    byParent.set(key, [...(byParent.get(key) ?? []), s]);
  }
  const result: Array<Section & { depth: number }> = [];
  function walk(parentId: string | null, depth: number) {
    for (const s of byParent.get(parentId) ?? []) {
      result.push({ ...s, depth });
      walk(s.id, depth + 1);
    }
  }
  walk(null, 0);
  return result;
}

export function SuiteDetailPage() {
  const { suiteId } = useParams<{ suiteId: string }>();
  const { user } = useAuth();
  const canManageStructure = user?.role === 'ADMIN' || user?.role === 'LEAD';
  const canWriteCases = canManageStructure || user?.role === 'TESTER';
  const queryClient = useQueryClient();

  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
  const [showSectionForm, setShowSectionForm] = useState(false);
  const [sectionName, setSectionName] = useState('');
  const [sectionParentId, setSectionParentId] = useState('');
  const [showCaseForm, setShowCaseForm] = useState(false);
  const [editingCase, setEditingCase] = useState<TestCase | null>(null);
  const [expandedCaseId, setExpandedCaseId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [csvMessage, setCsvMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const suiteQuery = useQuery({
    queryKey: ['suites', suiteId],
    queryFn: () => suitesApi.getSuite(suiteId!),
    enabled: !!suiteId,
  });

  const sections = useMemo(
    () => (suiteQuery.data ? buildIndentedSections(suiteQuery.data.suite.sections) : []),
    [suiteQuery.data],
  );

  const activeSectionId = selectedSectionId ?? sections[0]?.id ?? null;

  const casesQuery = useQuery({
    queryKey: ['sections', activeSectionId, 'cases'],
    queryFn: () => casesApi.listCasesBySection(activeSectionId!),
    enabled: !!activeSectionId,
  });

  const createSection = useMutation({
    mutationFn: () =>
      suitesApi.createSection(suiteId!, { name: sectionName, parentId: sectionParentId || undefined }),
    onSuccess: () => {
      setSectionName('');
      setSectionParentId('');
      setShowSectionForm(false);
      queryClient.invalidateQueries({ queryKey: ['suites', suiteId] });
    },
    onError: (err) => setFormError(err instanceof ApiError ? err.message : 'Failed to create section'),
  });

  const createCase = useMutation({
    mutationFn: (input: CaseInput) => casesApi.createCase(activeSectionId!, input),
    onSuccess: () => {
      setShowCaseForm(false);
      setFormError(null);
      queryClient.invalidateQueries({ queryKey: ['sections', activeSectionId, 'cases'] });
    },
    onError: (err) => setFormError(err instanceof ApiError ? err.message : 'Failed to create case'),
  });

  const updateCaseMutation = useMutation({
    mutationFn: (input: CaseInput) => casesApi.updateCase(editingCase!.id, input),
    onSuccess: () => {
      setEditingCase(null);
      setFormError(null);
      queryClient.invalidateQueries({ queryKey: ['sections', activeSectionId, 'cases'] });
    },
    onError: (err) => setFormError(err instanceof ApiError ? err.message : 'Failed to update case'),
  });

  const deleteCaseMutation = useMutation({
    mutationFn: (id: string) => casesApi.deleteCase(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sections', activeSectionId, 'cases'] }),
  });

  const importCsv = useMutation({
    mutationFn: (csv: string) => importCasesCsv(suiteId!, csv),
    onSuccess: (data) => {
      setCsvMessage(`Imported ${data.imported} case${data.imported === 1 ? '' : 's'}.`);
      queryClient.invalidateQueries({ queryKey: ['suites', suiteId] });
      queryClient.invalidateQueries({ queryKey: ['sections', activeSectionId, 'cases'] });
    },
    onError: (err) => setCsvMessage(err instanceof ApiError ? err.message : 'Failed to import CSV'),
  });

  function handleCreateSection(e: FormEvent) {
    e.preventDefault();
    createSection.mutate();
  }

  function handleImportFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => importCsv.mutate(String(reader.result));
    reader.readAsText(file);
    e.target.value = '';
  }

  if (suiteQuery.isLoading) return <p className="text-sm text-slate-500 dark:text-slate-400">Loading…</p>;
  if (!suiteQuery.data) return null;

  const suite = suiteQuery.data.suite;

  return (
    <div>
      <Link to={`/projects/${suite.projectId}`} className="mb-4 inline-block text-sm text-blue-600 dark:text-blue-400 hover:underline">
        ← Back to project
      </Link>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{suite.name}</h1>
        <div className="flex items-center gap-3">
          {csvMessage && <span className="text-xs text-slate-500 dark:text-slate-400">{csvMessage}</span>}
          <button
            className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
            onClick={() => downloadCasesCsv(suite.id, suite.name)}
          >
            Export CSV
          </button>
          {canWriteCases && (
            <>
              <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleImportFileChange} />
              <button className="text-sm text-blue-600 dark:text-blue-400 hover:underline" onClick={() => fileInputRef.current?.click()}>
                {importCsv.isPending ? 'Importing…' : 'Import CSV'}
              </button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-[240px_1fr] gap-6">
        <aside>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Sections</h2>
            {canManageStructure && (
              <button
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                onClick={() => setShowSectionForm((v) => !v)}
              >
                + Add
              </button>
            )}
          </div>

          {showSectionForm && (
            <form onSubmit={handleCreateSection} className="mb-3 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3">
              <Field>
                <Label htmlFor="section-name">Name</Label>
                <Input id="section-name" required value={sectionName} onChange={(e) => setSectionName(e.target.value)} />
              </Field>
              <Field>
                <Label htmlFor="section-parent">Parent section</Label>
                <Select id="section-parent" value={sectionParentId} onChange={(e) => setSectionParentId(e.target.value)}>
                  <option value="">(top level)</option>
                  {sections.map((s) => (
                    <option key={s.id} value={s.id}>
                      {'—'.repeat(s.depth)} {s.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Button type="submit" disabled={createSection.isPending} className="w-full">
                Add section
              </Button>
            </form>
          )}

          <nav className="space-y-0.5">
            {sections.map((s) => (
              <button
                key={s.id}
                onClick={() => setSelectedSectionId(s.id)}
                style={{ paddingLeft: `${8 + s.depth * 14}px` }}
                className={`block w-full rounded-md py-1.5 pr-2 text-left text-sm ${
                  s.id === activeSectionId ? 'bg-blue-50 dark:bg-blue-900/30 font-medium text-blue-700 dark:text-blue-400' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
                }`}
              >
                {s.name}
              </button>
            ))}
            {sections.length === 0 && <p className="text-sm text-slate-500 dark:text-slate-400">No sections yet.</p>}
          </nav>
        </aside>

        <section>
          {activeSectionId ? (
            <>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                  {sections.find((s) => s.id === activeSectionId)?.name}
                </h2>
                {canWriteCases && (
                  <Button
                    onClick={() => {
                      setShowCaseForm((v) => !v);
                      setEditingCase(null);
                      setFormError(null);
                    }}
                  >
                    + New case
                  </Button>
                )}
              </div>

              {formError && <p className="mb-3 text-sm text-red-600 dark:text-red-400">{formError}</p>}

              {showCaseForm && (
                <div className="mb-4">
                  <CaseForm
                    submitting={createCase.isPending}
                    onSubmit={(input) => createCase.mutate(input)}
                    onCancel={() => setShowCaseForm(false)}
                  />
                </div>
              )}

              <div className="divide-y divide-slate-200 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
                {casesQuery.data?.cases.map((testCase) => (
                  <div key={testCase.id} className="p-3">
                    <div className="flex items-center justify-between">
                      <button
                        className="flex-1 text-left"
                        onClick={() => setExpandedCaseId(expandedCaseId === testCase.id ? null : testCase.id)}
                      >
                        <div className="flex items-center gap-2">
                          <PriorityBadge priority={testCase.priority} />
                          <Badge>{testCase.type}</Badge>
                          <span className="text-sm font-medium text-slate-800 dark:text-slate-200">{testCase.title}</span>
                        </div>
                      </button>
                      {canWriteCases && (
                        <div className="flex shrink-0 gap-2">
                          <button
                            className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                            onClick={() => {
                              setEditingCase(testCase);
                              setShowCaseForm(false);
                              setFormError(null);
                            }}
                          >
                            Edit
                          </button>
                          {canManageStructure && (
                            <button
                              className="text-xs text-red-600 dark:text-red-400 hover:underline"
                              onClick={() => deleteCaseMutation.mutate(testCase.id)}
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    {editingCase?.id === testCase.id ? (
                      <div className="mt-3">
                        <CaseForm
                          initial={editingCase}
                          submitting={updateCaseMutation.isPending}
                          onSubmit={(input) => updateCaseMutation.mutate(input)}
                          onCancel={() => setEditingCase(null)}
                        />
                      </div>
                    ) : (
                      expandedCaseId === testCase.id && (
                        <div className="mt-2 space-y-2 text-sm text-slate-600 dark:text-slate-400">
                          {testCase.preconditions && (
                            <p>
                              <span className="font-medium text-slate-700 dark:text-slate-300">Preconditions: </span>
                              {testCase.preconditions}
                            </p>
                          )}
                          {testCase.steps && testCase.steps.length > 0 && (
                            <div>
                              <span className="font-medium text-slate-700 dark:text-slate-300">Steps:</span>
                              <ol className="ml-5 list-decimal">
                                {testCase.steps.map((step, i) => (
                                  <li key={i}>
                                    {step.step}
                                    {step.expected && <span className="text-slate-400 dark:text-slate-500"> → {step.expected}</span>}
                                  </li>
                                ))}
                              </ol>
                            </div>
                          )}
                          {testCase.expectedResult && (
                            <p>
                              <span className="font-medium text-slate-700 dark:text-slate-300">Expected result: </span>
                              {testCase.expectedResult}
                            </p>
                          )}
                        </div>
                      )
                    )}
                  </div>
                ))}
                {casesQuery.data?.cases.length === 0 && (
                  <p className="p-3 text-sm text-slate-500 dark:text-slate-400">No test cases in this section yet.</p>
                )}
              </div>
            </>
          ) : (
            <p className="text-sm text-slate-500 dark:text-slate-400">Create a section to start adding test cases.</p>
          )}
        </section>
      </div>
    </div>
  );
}
