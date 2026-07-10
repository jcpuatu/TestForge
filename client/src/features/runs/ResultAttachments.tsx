import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as attachmentsApi from '../../api/attachments';
import { AttachmentsPanel } from '../../components/AttachmentsPanel';
import { useToast } from '../../components/Toast';
import { ApiError } from '../../lib/apiClient';

export function ResultAttachments({ resultId, canManage }: { resultId: string; canManage: boolean }) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const { data } = useQuery({
    queryKey: ['results', resultId, 'attachments'],
    queryFn: () => attachmentsApi.listResultAttachments(resultId),
  });

  const upload = useMutation({
    mutationFn: (file: File) => attachmentsApi.uploadResultAttachment(resultId, file),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['results', resultId, 'attachments'] }),
    onError: (err) => showToast(err instanceof ApiError ? err.message : 'Failed to upload attachment', 'error'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => attachmentsApi.deleteAttachment(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['results', resultId, 'attachments'] }),
  });

  if (!canManage && (data?.attachments.length ?? 0) === 0) return null;

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
