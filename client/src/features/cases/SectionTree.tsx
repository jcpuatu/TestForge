import { useMemo, useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { useDroppable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { ChevronDown, ChevronRight, Pencil, Trash2 } from 'lucide-react';
import type { Section } from '../../api/types';
import { Input } from '../../components/Input';

export interface TreeNode extends Section {
  depth: number;
  hasChildren: boolean;
}

export function buildSectionTree(sections: Section[]): TreeNode[] {
  const byParent = new Map<string | null, Section[]>();
  for (const s of sections) {
    const key = s.parentId;
    byParent.set(key, [...(byParent.get(key) ?? []), s]);
  }
  const result: TreeNode[] = [];
  function walk(parentId: string | null, depth: number) {
    for (const s of byParent.get(parentId) ?? []) {
      result.push({ ...s, depth, hasChildren: (byParent.get(s.id)?.length ?? 0) > 0 });
      walk(s.id, depth + 1);
    }
  }
  walk(null, 0);
  return result;
}

// Every section id doubles as a dnd-kit draggable/sortable/droppable id (no prefix needed —
// case ids use a "case:" prefix instead, see SuiteDetailPage's handleDragEnd, so the two
// id spaces never collide).
function SectionRow({
  node,
  isActive,
  isEditing,
  editValue,
  onEditValueChange,
  onSelect,
  onStartRename,
  onSubmitRename,
  onCancelRename,
  onRequestDelete,
  canManageStructure,
  collapsed,
  onToggleCollapse,
}: {
  node: TreeNode;
  isActive: boolean;
  isEditing: boolean;
  editValue: string;
  onEditValueChange: (v: string) => void;
  onSelect: () => void;
  onStartRename: () => void;
  onSubmitRename: () => void;
  onCancelRename: () => void;
  onRequestDelete: () => void;
  canManageStructure: boolean;
  collapsed: boolean;
  onToggleCollapse: () => void;
}) {
  const sortable = useSortable({ id: node.id });
  // A section is also a plain droppable target (for cases dragged from the case list onto it)
  // distinct from its sortable drag handle — dnd-kit lets a node be both.
  const droppable = useDroppable({ id: node.id, data: { type: 'section' } });

  const style = {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
  };

  if (isEditing) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmitRename();
        }}
        style={{ paddingLeft: `${8 + node.depth * 14}px` }}
        className="flex items-center gap-1 py-0.5 pr-2"
      >
        <Input autoFocus value={editValue} onChange={(e) => onEditValueChange(e.target.value)} className="py-0.5 text-sm" />
        <button type="submit" className="text-xs text-blue-600 dark:text-blue-400 hover:underline">
          Save
        </button>
        <button type="button" className="text-xs text-slate-500 dark:text-slate-400 hover:underline" onClick={onCancelRename}>
          Cancel
        </button>
      </form>
    );
  }

  return (
    <div
      ref={(el) => {
        sortable.setNodeRef(el);
        droppable.setNodeRef(el);
      }}
      style={style}
      className={`group flex items-center rounded-md pr-1 ${droppable.isOver ? 'bg-blue-100 dark:bg-blue-900/50' : ''} ${sortable.isDragging ? 'opacity-40' : ''}`}
    >
      {node.hasChildren ? (
        <button
          onClick={onToggleCollapse}
          aria-label={collapsed ? 'Expand' : 'Collapse'}
          className="shrink-0 rounded p-0.5 text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
          style={{ marginLeft: `${node.depth * 14}px` }}
        >
          {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
      ) : (
        <span className="shrink-0" style={{ width: `${14 + node.depth * 14}px` }} />
      )}
      <button
        onClick={onSelect}
        {...sortable.attributes}
        {...sortable.listeners}
        className={`block flex-1 truncate rounded-md py-1.5 pl-2 text-left text-sm cursor-grab active:cursor-grabbing ${
          isActive
            ? 'bg-blue-50 dark:bg-blue-900/30 font-medium text-blue-700 dark:text-blue-400'
            : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
        }`}
      >
        {node.name}
      </button>
      {canManageStructure && (
        <div className="flex shrink-0 gap-0.5 opacity-0 group-hover:opacity-100">
          <button
            onClick={onStartRename}
            aria-label="Rename section"
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:text-slate-500 dark:hover:bg-slate-700 dark:hover:text-slate-300"
          >
            <Pencil className="h-3 w-3" />
          </button>
          <button
            onClick={onRequestDelete}
            aria-label="Delete section"
            className="rounded p-1 text-slate-400 hover:bg-red-100 hover:text-red-600 dark:text-slate-500 dark:hover:bg-red-900/50 dark:hover:text-red-400"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  );
}

export function SectionTree({
  sections,
  activeSectionId,
  onSelect,
  canManageStructure,
  editingSectionId,
  editingName,
  onEditingNameChange,
  onStartRename,
  onSubmitRename,
  onCancelRename,
  onRequestDelete,
}: {
  sections: Section[];
  activeSectionId: string | null;
  onSelect: (id: string) => void;
  canManageStructure: boolean;
  editingSectionId: string | null;
  editingName: string;
  onEditingNameChange: (v: string) => void;
  onStartRename: (id: string, currentName: string) => void;
  onSubmitRename: () => void;
  onCancelRename: () => void;
  onRequestDelete: (section: Section) => void;
}) {
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const tree = useMemo(() => buildSectionTree(sections), [sections]);

  // Grouped by parent (not flattened) so each parent's children can render as a nested block
  // immediately after that parent's own row — see renderChildren below.
  const childrenByParentId = useMemo(() => {
    const groups = new Map<string | null, TreeNode[]>();
    for (const node of tree) {
      const key = node.parentId;
      groups.set(key, [...(groups.get(key) ?? []), node]);
    }
    return groups;
  }, [tree]);

  function toggleCollapse(id: string) {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Recurses so each parent's SortableContext (scoped to just its direct children — dnd-kit's
  // usual nested-sortable-list pattern, reordering only ever happens within one sibling group)
  // renders immediately under that parent's own row, keeping DOM order matching visual tree
  // order at any depth. Previously all sibling groups were flattened into one Map keyed by
  // parentId and rendered in Map-insertion order, which put every top-level section's row
  // first, followed by each parent's children as separate trailing blocks — so a second parent
  // section's row visually split apart from the first parent's own children.
  function renderChildren(parentId: string | null) {
    const nodes = childrenByParentId.get(parentId) ?? [];
    if (nodes.length === 0) return null;
    return (
      <SortableContext items={nodes.map((n) => n.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-0.5">
          {nodes.map((node) => (
            <div key={node.id}>
              <SectionRow
                node={node}
                isActive={node.id === activeSectionId}
                isEditing={editingSectionId === node.id}
                editValue={editingName}
                onEditValueChange={onEditingNameChange}
                onSelect={() => onSelect(node.id)}
                onStartRename={() => onStartRename(node.id, node.name)}
                onSubmitRename={onSubmitRename}
                onCancelRename={onCancelRename}
                onRequestDelete={() => onRequestDelete(node)}
                canManageStructure={canManageStructure}
                collapsed={collapsedIds.has(node.id)}
                onToggleCollapse={() => toggleCollapse(node.id)}
              />
              {!collapsedIds.has(node.id) && renderChildren(node.id)}
            </div>
          ))}
        </div>
      </SortableContext>
    );
  }

  return (
    <div className="space-y-0.5">
      <div className="mb-1 flex justify-end gap-2 text-xs">
        <button className="text-blue-600 dark:text-blue-400 hover:underline" onClick={() => setCollapsedIds(new Set())}>
          Expand all
        </button>
        <button
          className="text-blue-600 dark:text-blue-400 hover:underline"
          onClick={() => setCollapsedIds(new Set(tree.filter((n) => n.hasChildren).map((n) => n.id)))}
        >
          Collapse all
        </button>
      </div>
      {renderChildren(null)}
      {tree.length === 0 && <p className="text-sm text-slate-500 dark:text-slate-400">No sections yet.</p>}
    </div>
  );
}
