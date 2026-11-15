import React, { useState } from 'react';
import { AlertCircle, AlertTriangle, Loader2, Trash2, X } from 'lucide-react';
import { getSupabaseErrorMessage, supabase } from '../lib/supabase';
import type { FamilyPerson, Profile } from '../types/database';
import { isPrivilegedRole } from '../utils/kinship';

interface DeletePersonModalProps {
  person: FamilyPerson | null;
  profile: Profile;
  onClose: () => void;
  onSuccess: (message: string) => void;
  onError?: (message: string) => void;
}

export const DeletePersonModal: React.FC<DeletePersonModalProps> = ({
  person,
  profile,
  onClose,
  onSuccess,
  onError,
}) => {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!person) return null;

  const isPrivileged = isPrivilegedRole(profile.role);

  const reportError = (err: unknown) => {
    const msg = getSupabaseErrorMessage(
      err,
      'تعذر تنفيذ عملية الحذف. تحقق من الاتصال أو الصلاحيات.'
    );
    setErrorMsg(msg);
    onError?.(msg);
  };

  async function handleDirectDelete() {
    if (!supabase || !person) return;
    setErrorMsg(null);
    setSubmitting(true);
    try {
      const { error } = await supabase
        .from('family_people')
        .delete()
        .eq('id', person.id);
      if (error) {
        reportError(error);
        return;
      }
      onSuccess(`تم حذف "${person.full_name}" من شجرة العائلة بنجاح.`);
      onClose();
    } catch (err) {
      reportError(err);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmitDeleteRequest(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase || !person) return;
    setErrorMsg(null);

    const cleanReason = reason.trim();

    setSubmitting(true);
    try {
      const basePayload = {
        requested_by: profile.id,
        requester_name: profile.full_name,
        request_type: 'delete',
        proposed_data: {
          full_name: person.full_name,
          father_id: person.father_id ?? null,
          gender: person.gender ?? null,
          branch_name: person.branch_name ?? null,
          generation: person.generation ?? null,
          location: person.location ?? null,
          birth_year: person.birth_year ?? null,
        },
        reason: cleanReason || 'طلب حذف فرد من قبل المشترك',
        status: 'pending',
      };

      let { error } = await supabase.from('change_requests').insert({
        ...basePayload,
        target_person_id: person.id,
        person_id: person.id,
      });

      if (error && (error.code === 'PGRST204' || error.code === '42703')) {
        const msg = `${error.message || ''} ${error.details || ''}`;
        if (msg.includes('target_person_id')) {
          const retry = await supabase.from('change_requests').insert({
            ...basePayload,
            person_id: person.id,
          });
          error = retry.error;
        } else if (msg.includes('person_id')) {
          const retry = await supabase.from('change_requests').insert({
            ...basePayload,
            target_person_id: person.id,
          });
          error = retry.error;
        }
      }

      if (error) {
        reportError(error);
        return;
      }

      onSuccess('تم إرسال طلبك بنجاح وبانتظار موافقة المالك أو المطور أو المشرفين.');
      onClose();
    } catch (err) {
      reportError(err);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-person-modal-title"
    >
      <div className="w-full max-w-md rounded-xl border border-[#E5E0D5] bg-white shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b border-[#E5E0D5] px-6 py-4">
          <div>
            <p className="text-xs font-medium text-[#B91C1C]">
              {isPrivileged ? 'حذف مباشر من الشجرة' : 'طلب حذف سجل'}
            </p>
            <h3
              id="delete-person-modal-title"
              className="font-heritage mt-0.5 text-xl font-bold text-[#1C1917]"
            >
              {isPrivileged ? 'تأكيد حذف الفرد' : 'تقديم طلب حذف الفرد'}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق النافذة"
            className="rounded-lg p-1.5 text-[#78716C] hover:bg-[#FAF8F4] hover:text-[#1C1917] transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6">
          {errorMsg && (
            <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-[#FCA5A5] bg-[#FEF2F2] p-3.5 text-xs leading-relaxed text-[#991B1B]">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span dir="auto">{errorMsg}</span>
            </div>
          )}

          {isPrivileged ? (
            <div className="space-y-4">
              <div className="flex items-start gap-3 rounded-lg border border-[#FCA5A5] bg-[#FEF2F2] p-4 text-xs leading-relaxed text-[#991B1B]">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p className="font-semibold">
                    هل أنت متأكد من حذف «{person.full_name}» من شجرة العائلة؟
                  </p>
                  <p className="mt-1">
                    سيتم حذف السجل فوراً ومباشرة من جدول <span className="font-mono">family_people</span> ولا يمكن التراجع عن هذا الإجراء.
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={submitting}
                  className="rounded-lg border border-[#D6CEBE] bg-white px-4 py-2 text-xs font-medium text-[#1C1917] hover:bg-[#F2EFE9] cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => void handleDirectDelete()}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#B91C1C] px-5 py-2 text-xs font-medium text-white hover:bg-[#991B1B] disabled:opacity-50 cursor-pointer"
                >
                  {submitting ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                  <span>تأكيد الحذف المباشر</span>
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmitDeleteRequest} className="space-y-4">
              <div className="rounded-lg border border-[#E5E0D5] bg-[#FAF8F4] p-3.5 text-xs leading-relaxed text-[#57534E]">
                <p>
                  الفرد المحدد: <strong className="text-[#1C1917]">{person.full_name}</strong>
                </p>
                <p className="mt-1">
                  لا يتم حذف الأسماء مباشرة لحماية سجل الأنساب؛ سيُرفع طلبك إلى المطور أو المشرف للمراجعة والموافقة.
                </p>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-[#1C1917]">
                  سبب الحذف (اختياري)
                </label>
                <textarea
                  rows={3}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="وضح سبب طلب حذف هذا الفرد (مثال: اسم مكرر أو خطأ في الإدخال)..."
                  className="w-full rounded-lg border border-[#D6CEBE] bg-[#FAF8F4] px-3.5 py-2.5 text-sm text-[#1C1917] focus:border-[#B91C1C] focus:bg-white focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={submitting}
                  className="rounded-lg border border-[#D6CEBE] bg-white px-4 py-2 text-xs font-medium text-[#1C1917] hover:bg-[#F2EFE9] cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#B91C1C] px-5 py-2 text-xs font-medium text-white hover:bg-[#991B1B] disabled:opacity-50 cursor-pointer"
                >
                  {submitting ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                  <span>إرسال طلب الحذف</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
