import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as attachmentsApi from '../../api/attachments';
import { AttachmentsPanel } from '../../components/AttachmentsPanel';
import { useToast } from '../../components/Toast';
import { ApiError } from '../../lib/apiClient';

export function CaseAttachments({ caseId, canManage }: { caseId: string; canManage: boolean }) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const { data } = useQuery({
    queryKey: ['cases', caseId, 'attachments'],
    queryFn: () => attachmentsApi.listCaseAttachments(caseId),
  });

  const upload = useMutation({
    mutationFn: (file: File) => attachmentsApi.uploadCaseAttachment(caseId, file),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cases', caseId, 'attachments'] }),
    onError: (err) => showToast(err instanceof ApiError ? err.message : 'Failed to upload attachment', 'error'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => attachmentsApi.deleteAttachment(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cases', caseId, 'attachments'] }),
  });

  return (
    <AttachmentsPanel
      attachments={data?.attachments ?? []}
      onUpload={(file) => upload.mutate(file)}
      onDelete={(id) => remove.mutate(id)}
      uploading={upload.isPending}
      canManage={canManage}
    />
  );
}
