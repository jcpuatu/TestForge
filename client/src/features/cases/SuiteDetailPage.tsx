import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { GripVertical, Pencil, Trash2 } from 'lucide-react';
import { DndContext, DragOverlay, PointerSensor, useDraggable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core';
import * as suitesApi from '../../api/suites';
import * as casesApi from '../../api/cases';
import type { CaseFilter, CaseInput } from '../../api/cases';
import { isFilterActive } from '../../api/cases';
import * as usersApi from '../../api/users';
import * as labelsApi from '../../api/labels';
import * as sharedStepsApi from '../../api/sharedSteps';
import type { Section, TestCase } from '../../api/types';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../../components/Button';
import { Field, Input, Label, Select } from '../../components/Input';
import { PriorityBadge, Badge } from '../../components/Badge';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Modal } from '../../components/Modal';
import { useToast } from '../../components/Toast';
import { CaseForm } from './CaseForm';
import { CaseFilterBar } from './CaseFilterBar';
import { BulkCaseActionsBar } from './BulkCaseActionsBar';
import { SectionTree } from './SectionTree';
import { SharedStepsManager } from './SharedStepsManager';
import { CaseHistoryModal } from './CaseHistoryModal';
import { CaseAttachments } from './CaseAttachments';
import { CsvExportDialog } from './CsvExportDialog';
import { PrintButton } from '../../components/PrintButton';
import { ApiError } from '../../lib/apiClient';
import { downloadCasesCsv, downloadFeatureFile, importCasesCsv, importFeatureFile } from '../../api/csv';

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

// A dedicated drag handle (rather than making the whole row draggable) so it doesn't fight
// with the row's own click-to-expand button or checkbox — useDraggable must be called from a
// component of its own since case rows are rendered via .map(), and hooks can't be called
// conditionally/in a loop within the parent's render function.
function CaseDragHandle({ caseId, disabled }: { caseId: string; disabled: boolean }) {
  const { attributes, listeners, setNodeRef } = useDraggable({ id: `case:${caseId}`, disabled });
  if (disabled) return <span className="mr-1 w-3.5 shrink-0" />;
  return (
    <button
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      aria-label="Drag to move"
      className="mr-1 shrink-0 cursor-grab touch-none text-slate-300 hover:text-slate-500 active:cursor-grabbing dark:text-slate-600 dark:hover:text-slate-400"
    >
      <GripVertical className="h-3.5 w-3.5" />
    </button>
  );
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
  const [showSharedStepsManager, setShowSharedStepsManager] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [historyCase, setHistoryCase] = useState<TestCase | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const featureFileInputRef = useRef<HTMLInputElement>(null);

  const [editingSuiteName, setEditingSuiteName] = useState<string | null>(null);
  const [suiteDeleteOpen, setSuiteDeleteOpen] = useState(false);
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [editSectionName, setEditSectionName] = useState('');
  const [sectionDeleteTarget, setSectionDeleteTarget] = useState<Section | null>(null);
  const [showDeleted, setShowDeleted] = useState(false);
  const [selectedCaseIds, setSelectedCaseIds] = useState<Set<string>>(new Set());
  const [permanentDeleteTarget, setPermanentDeleteTarget] = useState<TestCase | null>(null);
  const [caseFilter, setCaseFilter] = useState<CaseFilter>({});

  const suiteQuery = useQuery({
    queryKey: ['suites', suiteId],
    queryFn: () => suitesApi.getSuite(suiteId!),
    enabled: !!suiteId,
  });

  const usersQuery = useQuery({ queryKey: ['users', 'directory'], queryFn: usersApi.listUserDirectory });

  const projectId = suiteQuery.data?.suite.projectId;
  const labelsQuery = useQuery({
    queryKey: ['projects', projectId, 'labels'],
    queryFn: () => labelsApi.listLabels(projectId!),
    enabled: !!projectId,
  });
  const labels = labelsQuery.data?.labels ?? [];
  const sharedStepSetsQuery = useQuery({
    queryKey: ['projects', projectId, 'shared-step-sets'],
    queryFn: () => sharedStepsApi.listSharedStepSets(projectId!),
    enabled: !!projectId,
  });
  const sharedStepSets = sharedStepSetsQuery.data?.sharedStepSets ?? [];

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

  // Clear any bulk-selection whenever the visible case list changes to a different set —
  // otherwise a stale selection from a previous section/filter view could get bulk-edited
  // without those cases even being on screen anymore.
  useEffect(() => {
    setSelectedCaseIds(new Set());
  }, [activeSectionId, filtering, showDeleted]);

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

  const moveSectionMutation = useMutation({
    mutationFn: ({ id, parentId, orderIndex }: { id: string; parentId: string | null; orderIndex: number }) =>
      suitesApi.moveSection(id, parentId, orderIndex),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['suites', suiteId] }),
    onError: (err) => {
      showToast(err instanceof ApiError ? err.message : 'Failed to reorder section', 'error');
      queryClient.invalidateQueries({ queryKey: ['suites', suiteId] });
    },
  });

  const moveCaseMutation = useMutation({
    mutationFn: ({ caseIds, sectionId }: { caseIds: string[]; sectionId: string }) => casesApi.bulkUpdateCases(caseIds, { sectionId }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['sections'] });
      queryClient.invalidateQueries({ queryKey: ['suites', suiteId, 'cases'] });
      setSelectedCaseIds(new Set());
      showToast(`Moved ${data.updated} test case(s).`);
    },
    onError: (err) => showToast(err instanceof ApiError ? err.message : 'Failed to move test case(s)', 'error'),
  });

  const dndSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const [draggingCaseId, setDraggingCaseId] = useState<string | null>(null);

  function handleDragStart(event: DragStartEvent) {
    const id = String(event.active.id);
    if (id.startsWith('case:')) setDraggingCaseId(id.slice('case:'.length));
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setDraggingCaseId(null);
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);

    if (activeId.startsWith('case:')) {
      const draggedCaseId = activeId.slice('case:'.length);
      // If the dragged case is part of the current multi-select, move the whole selection
      // together; otherwise just the one case being dragged.
      const caseIds = selectedCaseIds.has(draggedCaseId) ? [...selectedCaseIds] : [draggedCaseId];
      moveCaseMutation.mutate({ caseIds, sectionId: overId });
      return;
    }

    // Section reorder: only meaningful within the same sibling group (SectionTree gives each
    // parent group its own SortableContext, so a cross-group drag target won't reach here in
    // practice — this guard is a belt-and-suspenders check, not the primary mechanism).
    if (activeId === overId) return;
    const allSections = suiteQuery.data?.suite.sections ?? [];
    const dragged = allSections.find((s) => s.id === activeId);
    const target = allSections.find((s) => s.id === overId);
    if (!dragged || !target || dragged.parentId !== target.parentId) return;
    const siblings = allSections.filter((s) => s.parentId === dragged.parentId).sort((a, b) => a.orderIndex - b.orderIndex);
    const targetIndex = siblings.findIndex((s) => s.id === overId);
    moveSectionMutation.mutate({ id: dragged.id, parentId: dragged.parentId, orderIndex: targetIndex });
  }

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
    mutationFn: () => casesApi.bulkRestoreCases([...selectedCaseIds]),
    onSuccess: (data) => {
      setSelectedCaseIds(new Set());
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

  const importFeature = useMutation({
    mutationFn: (featureText: string) => importFeatureFile(suiteId!, featureText),
    onSuccess: (data) => {
      setCsvMessage(`Imported ${data.imported} scenario${data.imported === 1 ? '' : 's'} into "${data.sectionName}".`);
      queryClient.invalidateQueries({ queryKey: ['suites', suiteId] });
      queryClient.invalidateQueries({ queryKey: ['sections', activeSectionId, 'cases'] });
    },
    onError: (err) => setCsvMessage(err instanceof ApiError ? err.message : 'Failed to import .feature file'),
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

  function handleImportFeatureFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => importFeature.mutate(String(reader.result));
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
        <div className="no-print flex items-center gap-3">
          {csvMessage && <span className="text-xs text-slate-500 dark:text-slate-400">{csvMessage}</span>}
          <PrintButton />
          <button
            className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
            onClick={() => setShowSharedStepsManager(true)}
          >
            Shared Steps
          </button>
          <button
            className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
            onClick={() => setShowExportDialog(true)}
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
          <button
            className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
            onClick={() => downloadFeatureFile(suite.id, suite.name)}
          >
            Export .feature
          </button>
          {canWriteCases && (
            <>
              <input
                ref={featureFileInputRef}
                type="file"
                accept=".feature"
                className="hidden"
                onChange={handleImportFeatureFileChange}
              />
              <button
                className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                onClick={() => featureFileInputRef.current?.click()}
              >
                {importFeature.isPending ? 'Importing…' : 'Import .feature'}
              </button>
            </>
          )}
        </div>
      </div>

      <DndContext sensors={dndSensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <DragOverlay>
        {draggingCaseId &&
          (() => {
            const draggedCase = casesQuery.data?.cases.find((c) => c.id === draggingCaseId);
            const count = selectedCaseIds.has(draggingCaseId) ? selectedCaseIds.size : 1;
            return (
              <div className="rounded-md border border-blue-300 dark:border-blue-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm font-medium text-slate-800 dark:text-slate-200 shadow-lg">
                {count > 1 ? `${count} test cases` : draggedCase?.title ?? 'Test case'}
              </div>
            );
          })()}
      </DragOverlay>
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

          <SectionTree
            sections={suiteQuery.data.suite.sections}
            activeSectionId={activeSectionId}
            onSelect={setSelectedSectionId}
            canManageStructure={canManageStructure}
            editingSectionId={editingSectionId}
            editingName={editSectionName}
            onEditingNameChange={setEditSectionName}
            onStartRename={(id, name) => {
              setEditingSectionId(id);
              setEditSectionName(name);
            }}
            onSubmitRename={() => updateSection.mutate({ id: editingSectionId!, name: editSectionName })}
            onCancelRename={() => setEditingSectionId(null)}
            onRequestDelete={setSectionDeleteTarget}
          />
        </aside>

        <section>
          {activeSectionId ? (
            <>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                  {filtering ? 'All test cases (filtered)' : sections.find((s) => s.id === activeSectionId)?.name}
                </h2>
                <div className="no-print flex items-center gap-3">
                  {canManageStructure && (
                    <label className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                      <input
                        type="checkbox"
                        checked={showDeleted}
                        onChange={(e) => {
                          setShowDeleted(e.target.checked);
                          setSelectedCaseIds(new Set());
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

              <div className="no-print mb-3">
                <CaseFilterBar
                  sections={sections}
                  users={usersQuery.data?.users ?? []}
                  labels={labels}
                  canManageLabels={canManageStructure}
                  projectId={projectId ?? ''}
                  filter={caseFilter}
                  onChange={setCaseFilter}
                />
              </div>

              {formError && <p className="mb-3 text-sm text-red-600 dark:text-red-400">{formError}</p>}

              {showCaseForm && !showDeleted && !filtering && (
                <div className="mb-4">
                  <CaseForm
                    availableLabels={labels}
                    availableSharedStepSets={sharedStepSets}
                    submitting={createCase.isPending}
                    onSubmit={(input) => createCase.mutate(input)}
                    onCancel={() => setShowCaseForm(false)}
                  />
                </div>
              )}

              {showDeleted && selectedCaseIds.size > 0 && (
                <div className="mb-3 flex items-center gap-3 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700 px-3 py-2">
                  <span className="text-xs text-slate-600 dark:text-slate-400">{selectedCaseIds.size} selected</span>
                  <Button
                    variant="secondary"
                    onClick={() => bulkRestoreMutation.mutate()}
                    disabled={bulkRestoreMutation.isPending}
                  >
                    {bulkRestoreMutation.isPending ? 'Restoring…' : 'Restore selected'}
                  </Button>
                </div>
              )}

              {!showDeleted && selectedCaseIds.size > 0 && (
                <BulkCaseActionsBar
                  suiteId={suiteId!}
                  selectedIds={[...selectedCaseIds]}
                  sections={sections}
                  labels={labels}
                  canDelete={canManageStructure}
                  onDone={() => setSelectedCaseIds(new Set())}
                />
              )}

              <div className="divide-y divide-slate-200 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
                {casesQuery.data?.cases.map((testCase) => (
                  <div key={testCase.id} className="p-3">
                    <div className="flex items-center justify-between">
                      {canWriteCases && <CaseDragHandle caseId={testCase.id} disabled={showDeleted} />}
                      {canWriteCases && (
                        <input
                          type="checkbox"
                          className="mr-2"
                          checked={selectedCaseIds.has(testCase.id)}
                          onChange={(e) => {
                            setSelectedCaseIds((prev) => {
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
                          {testCase.labels.map((l) => (
                            <span
                              key={l.id}
                              className="rounded-full border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 text-xs text-blue-700 dark:text-blue-400"
                            >
                              {l.name}
                            </span>
                          ))}
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
                        <div className="flex shrink-0 gap-2">
                          <button
                            className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                            onClick={() => setHistoryCase(testCase)}
                          >
                            History
                          </button>
                          {canWriteCases && (
                            <>
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
                            </>
                          )}
                        </div>
                      )}
                    </div>

                    {editingCase?.id === testCase.id ? (
                      <div className="mt-3">
                        <CaseForm
                          initial={editingCase}
                          availableLabels={labels}
                          availableSharedStepSets={sharedStepSets}
                          submitting={updateCaseMutation.isPending}
                          onSubmit={(input) => updateCaseMutation.mutate(input)}
                          onCancel={() => setEditingCase(null)}
                        />
                      </div>
                    ) : (
                      expandedCaseId === testCase.id && (
                        // Note: only whichever case is currently expanded contributes detail
                        // content to a printed report — this page renders one case's detail at
                        // a time by design (click-to-expand), so Outline vs. Details correctly
                        // hides/shows this block, but Details mode can't retroactively expand
                        // every other case in the list too. Expand what you want included first.
                        <div className="print-detail-only mt-2 space-y-2 text-sm text-slate-600 dark:text-slate-400">
                          {testCase.template === 'BDD' ? (
                            testCase.bddLines &&
                            testCase.bddLines.length > 0 && (
                              <ol className="ml-5 list-none space-y-0.5 font-mono text-xs">
                                {testCase.bddLines.map((line, i) => (
                                  <li key={i}>
                                    <span className="font-semibold text-blue-700 dark:text-blue-400">{line.keyword}</span> {line.text}
                                  </li>
                                ))}
                              </ol>
                            )
                          ) : testCase.template === 'EXPLORATORY' ? (
                            <>
                              {testCase.mission && (
                                <p>
                                  <span className="font-medium text-slate-700 dark:text-slate-300">Mission: </span>
                                  {testCase.mission}
                                </p>
                              )}
                              {testCase.goals && (
                                <p className="whitespace-pre-line">
                                  <span className="font-medium text-slate-700 dark:text-slate-300">Goals: </span>
                                  {testCase.goals}
                                </p>
                              )}
                            </>
                          ) : (
                            <>
                              {testCase.preconditions && (
                                <p>
                                  <span className="font-medium text-slate-700 dark:text-slate-300">Preconditions: </span>
                                  {testCase.preconditions}
                                </p>
                              )}
                              {testCase.steps && testCase.steps.length > 0 && testCase.template === 'STEPS' && (
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
                              {testCase.steps && testCase.steps.length > 0 && testCase.template === 'TEXT' && (
                                <p className="whitespace-pre-line">
                                  <span className="font-medium text-slate-700 dark:text-slate-300">Steps: </span>
                                  {testCase.steps[0].step}
                                </p>
                              )}
                              {testCase.sharedSteps.map((set) => (
                                <div key={set.id}>
                                  <span className="font-medium text-slate-700 dark:text-slate-300">Shared: {set.name}</span>
                                  <ol className="ml-5 list-decimal">
                                    {set.steps.map((step, i) => (
                                      <li key={i}>
                                        {step.step}
                                        {step.expected && <span className="text-slate-400 dark:text-slate-500"> → {step.expected}</span>}
                                      </li>
                                    ))}
                                  </ol>
                                </div>
                              ))}
                              {testCase.expectedResult && (
                                <p>
                                  <span className="font-medium text-slate-700 dark:text-slate-300">Expected result: </span>
                                  {testCase.expectedResult}
                                </p>
                              )}
                            </>
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
                          <CaseAttachments caseId={testCase.id} canManage={canWriteCases} />
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
      </DndContext>

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

      <Modal open={showSharedStepsManager} onClose={() => setShowSharedStepsManager(false)} title="Shared step sets">
        <SharedStepsManager projectId={projectId ?? ''} sharedStepSets={sharedStepSets} />
      </Modal>

      {historyCase && <CaseHistoryModal caseId={historyCase.id} caseTitle={historyCase.title} onClose={() => setHistoryCase(null)} />}

      <CsvExportDialog
        open={showExportDialog}
        onClose={() => setShowExportDialog(false)}
        sections={sections}
        onExport={({ sectionIds, columns }) => downloadCasesCsv(suite.id, suite.name, { sectionIds, columns })}
      />
    </div>
  );
}
