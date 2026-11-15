import React, { useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, Mail, X } from 'lucide-react';
import { getSupabaseErrorMessage, isSupabaseConfigured, supabase } from '../lib/supabase';

interface AccountRecoveryModalProps {
  initialEmail?: string;
  onClose: () => void;
}

export const AccountRecoveryModal: React.FC<AccountRecoveryModalProps> = ({
  initialEmail = '',
  onClose,
}) => {
  const [email, setEmail] = useState(initialEmail);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!supabase || !isSupabaseConfigured) {
      setErrorMsg('اتصال Supabase غير مهيأ. يرجى التحقق من إعدادات البيئة.');
      return;
    }

    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setErrorMsg('يرجى إدخال البريد الإلكتروني المسجل.');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo: window.location.origin,
      });
      if (error) throw error;

      setSuccessMsg(
        'تم إرسال رابط إعادة تعيين كلمة المرور إلى بريدك الإلكتروني. يرجى مراجعة صندوق الوارد، وكذلك مجلد الرسائل غير المرغوب فيها (Spam) في حال عدم ظهور الرسالة.'
      );
    } catch (err) {
      setErrorMsg(
        getSupabaseErrorMessage(err, 'تعذر إرسال رابط إعادة تعيين كلمة المرور.')
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="recovery-modal-title"
    >
      <div className="w-full max-w-md rounded-xl border border-[#E5E0D5] bg-white shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b border-[#E5E0D5] px-6 py-4">
          <div>
            <p className="text-xs font-medium text-[#92400E]">استعادة الحساب</p>
            <h3
              id="recovery-modal-title"
              className="font-heritage mt-0.5 text-xl font-bold text-[#1C1917]"
            >
              استعادة كلمة المرور
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

        <form onSubmit={handleSubmit} className="space-y-4 p-6">
          <p className="text-xs leading-relaxed text-[#57534E]">
            أدخل بريدك الإلكتروني المسجل في حسابك، وسنرسل لك رابطاً آمناً لإعادة تعيين كلمة المرور.
          </p>

          {errorMsg && (
            <div className="flex items-start gap-2.5 rounded-lg border border-[#FCA5A5] bg-[#FEF2F2] p-3.5 text-xs leading-relaxed text-[#991B1B]">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="flex items-start gap-2.5 rounded-lg border border-[#86EFAC] bg-[#F0FDF4] p-3.5 text-xs leading-relaxed text-[#166534]">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-xs font-medium text-[#1C1917]">
              البريد الإلكتروني المسجل
            </label>
            <input
              type="email"
              required
              dir="ltr"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              className="w-full rounded-lg border border-[#D6CEBE] bg-[#FAF8F4] px-3.5 py-2.5 text-sm text-[#1C1917] focus:border-[#14532D] focus:bg-white focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-[#E5E0D5] bg-white px-4 py-2 text-xs font-medium text-[#57534E] hover:bg-[#FAF8F4] transition-colors cursor-pointer"
            >
              {successMsg ? 'إغلاق' : 'إلغاء'}
            </button>
            <button
              type="submit"
              disabled={loading || !isSupabaseConfigured}
              className="inline-flex items-center gap-2 rounded-lg bg-[#14532D] px-5 py-2 text-xs font-medium text-white hover:bg-[#166534] disabled:opacity-50 transition-colors cursor-pointer"
            >
              {loading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Mail className="h-3.5 w-3.5" />
              )}
              <span>إرسال رابط الاستعادة</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
