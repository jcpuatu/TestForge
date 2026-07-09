import { useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Pencil, Trash2 } from 'lucide-react';
import * as suitesApi from '../../api/suites';
import * as casesApi from '../../api/cases';
import type { CaseFilter, CaseInput } from '../../api/cases';
import { isFilterActive } from '../../api/cases';
import * as usersApi from '../../api/users';
import type { Section, TestCase } from '../../api/types';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../../components/Button';
import { Field, Input, Label, Select } from '../../components/Input';
import { PriorityBadge, Badge } from '../../components/Badge';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { useToast } from '../../components/Toast';
import { CaseForm } from './CaseForm';
import { CaseFilterBar } from './CaseFilterBar';
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
  const navigate = useNavigate();
  const canManageStructure = user?.role === 'ADMIN' || user?.role === 'LEAD';
  const canWriteCases = canManageStructure || user?.role === 'TESTER';
  const queryClient = useQueryClient();
  const { showToast } = useToast();

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

  const [editingSuiteName, setEditingSuiteName] = useState<string | null>(null);
  const [suiteDeleteOpen, setSuiteDeleteOpen] = useState(false);
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [editSectionName, setEditSectionName] = useState('');
  const [sectionDeleteTarget, setSectionDeleteTarget] = useState<Section | null>(null);
  const [showDeleted, setShowDeleted] = useState(false);
  const [selectedDeletedIds, setSelectedDeletedIds] = useState<Set<string>>(new Set());
  const [permanentDeleteTarget, setPermanentDeleteTarget] = useState<TestCase | null>(null);
  const [caseFilter, setCaseFilter] = useState<CaseFilter>({});

  const suiteQuery = useQuery({
    queryKey: ['suites', suiteId],
    queryFn: () => suitesApi.getSuite(suiteId!),
    enabled: !!suiteId,
  });

  const usersQuery = useQuery({ queryKey: ['users', 'directory'], queryFn: usersApi.listUserDirectory });

  const sections = useMemo(
    () => (suiteQuery.data ? buildIndentedSections(suiteQuery.data.suite.sections) : []),
    [suiteQuery.data],
  );
  const sectionNameById = useMemo(() => new Map(sections.map((s) => [s.id, s.name])), [sections]);
  const filtering = isFilterActive(caseFilter);

  const activeSectionId = selectedSectionId ?? sections[0]?.id ?? null;

  const sectionCasesQuery = useQuery({
    queryKey: ['sections', activeSectionId, 'cases', showDeleted, caseFilter.sortBy, caseFilter.sortDir],
    queryFn: () =>
      casesApi.listCasesBySection(activeSectionId!, { deleted: showDeleted, sortBy: caseFilter.sortBy, sortDir: caseFilter.sortDir }),
    enabled: !!activeSectionId && !filtering,
  });

  const filteredCasesQuery = useQuery({
    queryKey: ['suites', suiteId, 'cases', 'filtered', caseFilter, showDeleted],
    queryFn: () => casesApi.listCasesBySuite(suiteId!, { ...caseFilter, deleted: showDeleted }),
    enabled: !!suiteId && filtering,
  });

  const casesQuery = filtering ? filteredCasesQuery : sectionCasesQuery;

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

  const updateSuite = useMutation({
    mutationFn: (name: string) => suitesApi.updateSuite(suiteId!, { name }),
    onSuccess: () => {
      setEditingSuiteName(null);
      queryClient.invalidateQueries({ queryKey: ['suites', suiteId] });
      showToast('Suite renamed.');
    },
    onError: (err) => showToast(err instanceof ApiError ? err.message : 'Failed to rename suite', 'error'),
  });

  const suiteDeleteImpactQuery = useQuery({
    queryKey: ['suites', suiteId, 'delete-impact'],
    queryFn: () => suitesApi.getSuiteDeleteImpact(suiteId!),
    enabled: suiteDeleteOpen,
  });

  const deleteSuite = useMutation({
    mutationFn: () => suitesApi.deleteSuite(suiteId!),
    onSuccess: () => {
      showToast('Suite deleted.');
      navigate(`/projects/${suiteQuery.data!.suite.projectId}`);
    },
    onError: (err) => showToast(err instanceof ApiError ? err.message : 'Failed to delete suite', 'error'),
  });

  const updateSection = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => suitesApi.updateSection(id, { name }),
    onSuccess: () => {
      setEditingSectionId(null);
      queryClient.invalidateQueries({ queryKey: ['suites', suiteId] });
      showToast('Section renamed.');
    },
    onError: (err) => showToast(err instanceof ApiError ? err.message : 'Failed to rename section', 'error'),
  });

  const sectionDeleteImpactQuery = useQuery({
    queryKey: ['sections', sectionDeleteTarget?.id, 'delete-impact'],
    queryFn: () => suitesApi.getSectionDeleteImpact(sectionDeleteTarget!.id),
    enabled: !!sectionDeleteTarget,
  });

  const deleteSection = useMutation({
    mutationFn: (id: string) => suitesApi.deleteSection(id),
    onSuccess: () => {
      if (selectedSectionId === sectionDeleteTarget?.id) setSelectedSectionId(null);
      setSectionDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ['suites', suiteId] });
      showToast('Section deleted.');
    },
    onError: (err) => showToast(err instanceof ApiError ? err.message : 'Failed to delete section', 'error'),
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

  const restoreCaseMutation = useMutation({
    mutationFn: (id: string) => casesApi.restoreCase(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sections', activeSectionId, 'cases'] });
      showToast('Test case restored.');
    },
    onError: (err) => showToast(err instanceof ApiError ? err.message : 'Failed to restore case', 'error'),
  });

  const bulkRestoreMutation = useMutation({
    mutationFn: () => casesApi.bulkRestoreCases([...selectedDeletedIds]),
    onSuccess: (data) => {
      setSelectedDeletedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ['sections', activeSectionId, 'cases'] });
      showToast(`Restored ${data.restored} test case(s).`);
    },
    onError: (err) => showToast(err instanceof ApiError ? err.message : 'Failed to restore cases', 'error'),
  });

  const permanentDeleteMutation = useMutation({
    mutationFn: (id: string) => casesApi.permanentlyDeleteCase(id),
    onSuccess: () => {
      setPermanentDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ['sections', activeSectionId, 'cases'] });
      showToast('Test case permanently deleted.');
    },
    onError: (err) => showToast(err instanceof ApiError ? err.message : 'Failed to permanently delete case', 'error'),
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
        {editingSuiteName !== null ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              updateSuite.mutate(editingSuiteName);
            }}
            className="flex items-center gap-2"
          >
            <Input
              autoFocus
              aria-label="Suite name"
              value={editingSuiteName}
              onChange={(e) => setEditingSuiteName(e.target.value)}
              className="text-2xl font-semibold"
            />
            <Button type="submit" disabled={updateSuite.isPending}>
              Save
            </Button>
            <Button type="button" variant="secondary" onClick={() => setEditingSuiteName(null)}>
              Cancel
            </Button>
          </form>
        ) : (
          <div className="group flex items-center gap-2">
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{suite.name}</h1>
            {canManageStructure && (
              <div className="flex gap-1 opacity-0 group-hover:opacity-100">
                <button
                  onClick={() => setEditingSuiteName(suite.name)}
                  aria-label="Rename suite"
                  className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:text-slate-500 dark:hover:bg-slate-700 dark:hover:text-slate-300"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setSuiteDeleteOpen(true)}
                  aria-label="Delete suite"
                  className="rounded p-1 text-slate-400 hover:bg-red-100 hover:text-red-600 dark:text-slate-500 dark:hover:bg-red-900/50 dark:hover:text-red-400"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        )}
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
            {sections.map((s) =>
              editingSectionId === s.id ? (
                <form
                  key={s.id}
                  onSubmit={(e) => {
                    e.preventDefault();
                    updateSection.mutate({ id: s.id, name: editSectionName });
                  }}
                  style={{ paddingLeft: `${8 + s.depth * 14}px` }}
                  className="flex items-center gap-1 py-0.5 pr-2"
                >
                  <Input
                    autoFocus
                    value={editSectionName}
                    onChange={(e) => setEditSectionName(e.target.value)}
                    className="py-0.5 text-sm"
                  />
                  <button type="submit" className="text-xs text-blue-600 dark:text-blue-400 hover:underline">
                    Save
                  </button>
                  <button
                    type="button"
                    className="text-xs text-slate-500 dark:text-slate-400 hover:underline"
                    onClick={() => setEditingSectionId(null)}
                  >
                    Cancel
                  </button>
                </form>
              ) : (
                <div key={s.id} className="group flex items-center rounded-md pr-1">
                  <button
                    onClick={() => setSelectedSectionId(s.id)}
                    style={{ paddingLeft: `${8 + s.depth * 14}px` }}
                    className={`block flex-1 truncate rounded-md py-1.5 text-left text-sm ${
                      s.id === activeSectionId ? 'bg-blue-50 dark:bg-blue-900/30 font-medium text-blue-700 dark:text-blue-400' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
                    }`}
                  >
                    {s.name}
                  </button>
                  {canManageStructure && (
                    <div className="flex shrink-0 gap-0.5 opacity-0 group-hover:opacity-100">
                      <button
                        onClick={() => {
                          setEditingSectionId(s.id);
                          setEditSectionName(s.name);
                        }}
                        aria-label="Rename section"
                        className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:text-slate-500 dark:hover:bg-slate-700 dark:hover:text-slate-300"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button
                        onClick={() => setSectionDeleteTarget(s)}
                        aria-label="Delete section"
                        className="rounded p-1 text-slate-400 hover:bg-red-100 hover:text-red-600 dark:text-slate-500 dark:hover:bg-red-900/50 dark:hover:text-red-400"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                </div>
              ),
            )}
            {sections.length === 0 && <p className="text-sm text-slate-500 dark:text-slate-400">No sections yet.</p>}
          </nav>
        </aside>

        <section>
          {activeSectionId ? (
            <>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                  {filtering ? 'All test cases (filtered)' : sections.find((s) => s.id === activeSectionId)?.name}
                </h2>
                <div className="flex items-center gap-3">
                  {canManageStructure && (
                    <label className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                      <input
                        type="checkbox"
                        checked={showDeleted}
                        onChange={(e) => {
                          setShowDeleted(e.target.checked);
                          setSelectedDeletedIds(new Set());
                        }}
                      />
                      Show deleted
                    </label>
                  )}
                  {canWriteCases && !showDeleted && !filtering && (
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
              </div>

              <div className="mb-3">
                <CaseFilterBar
                  sections={sections}
                  users={usersQuery.data?.users ?? []}
                  filter={caseFilter}
                  onChange={setCaseFilter}
                />
              </div>

              {formError && <p className="mb-3 text-sm text-red-600 dark:text-red-400">{formError}</p>}

              {showCaseForm && !showDeleted && !filtering && (
                <div className="mb-4">
                  <CaseForm
                    submitting={createCase.isPending}
                    onSubmit={(input) => createCase.mutate(input)}
                    onCancel={() => setShowCaseForm(false)}
                  />
                </div>
              )}

              {showDeleted && selectedDeletedIds.size > 0 && (
                <div className="mb-3 flex items-center gap-3 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700 px-3 py-2">
                  <span className="text-xs text-slate-600 dark:text-slate-400">{selectedDeletedIds.size} selected</span>
                  <Button
                    variant="secondary"
                    onClick={() => bulkRestoreMutation.mutate()}
                    disabled={bulkRestoreMutation.isPending}
                  >
                    {bulkRestoreMutation.isPending ? 'Restoring…' : 'Restore selected'}
                  </Button>
                </div>
              )}

              <div className="divide-y divide-slate-200 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
                {casesQuery.data?.cases.map((testCase) => (
                  <div key={testCase.id} className="p-3">
                    <div className="flex items-center justify-between">
                      {showDeleted && (
                        <input
                          type="checkbox"
                          className="mr-2"
                          checked={selectedDeletedIds.has(testCase.id)}
                          onChange={(e) => {
                            setSelectedDeletedIds((prev) => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(testCase.id);
                              else next.delete(testCase.id);
                              return next;
                            });
                          }}
                        />
                      )}
                      <button
                        className="flex-1 text-left"
                        onClick={() => setExpandedCaseId(expandedCaseId === testCase.id ? null : testCase.id)}
                      >
                        <div className="flex items-center gap-2">
                          <PriorityBadge priority={testCase.priority} />
                          <Badge>{testCase.type}</Badge>
                          {filtering && testCase.sectionId && (
                            <Badge className="bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400">
                              {sectionNameById.get(testCase.sectionId) ?? 'Unknown section'}
                            </Badge>
                          )}
                          <span className="text-sm font-medium text-slate-800 dark:text-slate-200">{testCase.title}</span>
                        </div>
                      </button>
                      {showDeleted ? (
                        canManageStructure && (
                          <div className="flex shrink-0 gap-2">
                            <button
                              className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                              onClick={() => restoreCaseMutation.mutate(testCase.id)}
                            >
                              Restore
                            </button>
                            <button
                              className="text-xs text-red-600 dark:text-red-400 hover:underline"
                              onClick={() => setPermanentDeleteTarget(testCase)}
                            >
                              Delete permanently
                            </button>
                          </div>
                        )
                      ) : (
                        canWriteCases && (
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
                        )
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
                          {testCase.estimate && (
                            <p>
                              <span className="font-medium text-slate-700 dark:text-slate-300">Estimate: </span>
                              {testCase.estimate}
                            </p>
                          )}
                          {testCase.referenceLink && (
                            <p>
                              <span className="font-medium text-slate-700 dark:text-slate-300">References: </span>
                              {testCase.referenceLink}
                            </p>
                          )}
                        </div>
                      )
                    )}
                  </div>
                ))}
                {casesQuery.data?.cases.length === 0 && (
                  <p className="p-3 text-sm text-slate-500 dark:text-slate-400">
                    {showDeleted ? 'No deleted test cases in this section.' : 'No test cases in this section yet.'}
                  </p>
                )}
              </div>
            </>
          ) : (
            <p className="text-sm text-slate-500 dark:text-slate-400">Create a section to start adding test cases.</p>
          )}
        </section>
      </div>

      <ConfirmDialog
        open={suiteDeleteOpen}
        onClose={() => setSuiteDeleteOpen(false)}
        onConfirm={() => deleteSuite.mutate()}
        title={`Delete "${suite.name}"?`}
        confirmLabel="Delete suite"
        confirming={deleteSuite.isPending}
        message={
          suiteDeleteImpactQuery.data ? (
            <>
              This permanently deletes <strong>{suiteDeleteImpactQuery.data.caseCount}</strong> test case(s) and{' '}
              <strong>{suiteDeleteImpactQuery.data.activeRunCount}</strong> active test run(s) with their results.{' '}
              {suiteDeleteImpactQuery.data.closedRunCount > 0 && (
                <>
                  <strong>{suiteDeleteImpactQuery.data.closedRunCount}</strong> closed run(s) will be preserved.{' '}
                </>
              )}
              This cannot be undone.
            </>
          ) : (
            'Loading impact…'
          )
        }
      />

      <ConfirmDialog
        open={!!sectionDeleteTarget}
        onClose={() => setSectionDeleteTarget(null)}
        onConfirm={() => deleteSection.mutate(sectionDeleteTarget!.id)}
        title={`Delete "${sectionDeleteTarget?.name}"?`}
        confirmLabel="Delete section"
        confirming={deleteSection.isPending}
        message={
          sectionDeleteImpactQuery.data ? (
            <>
              This permanently deletes <strong>{sectionDeleteImpactQuery.data.caseCount}</strong> test case(s)
              {sectionDeleteImpactQuery.data.subsectionCount > 0 && (
                <>
                  {' '}
                  and <strong>{sectionDeleteImpactQuery.data.subsectionCount}</strong> subsection(s)
                </>
              )}
              . This cannot be undone.
            </>
          ) : (
            'Loading impact…'
          )
        }
      />

      <ConfirmDialog
        open={!!permanentDeleteTarget}
        onClose={() => setPermanentDeleteTarget(null)}
        onConfirm={() => permanentDeleteMutation.mutate(permanentDeleteTarget!.id)}
        title={`Permanently delete "${permanentDeleteTarget?.title}"?`}
        confirmLabel="Delete permanently"
        confirming={permanentDeleteMutation.isPending}
        message="This immediately and permanently removes the test case. It cannot be restored."
      />
    </div>
  );
}
