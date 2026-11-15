import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  X,
} from 'lucide-react';
import { getSupabaseErrorMessage, isSupabaseConfigured, supabase } from '../lib/supabase';

interface ResetPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (message: string) => void;
}

export const ResetPasswordModal: React.FC<ResetPasswordModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [hasValidSession, setHasValidSession] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    let active = true;

    async function verifyRecoverySession() {
      if (!supabase || !isSupabaseConfigured) {
        if (active) {
          setHasValidSession(false);
          setCheckingSession(false);
        }
        return;
      }

      setCheckingSession(true);
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (active) {
          setHasValidSession(Boolean(session?.user));
        }
      } finally {
        if (active) {
          setCheckingSession(false);
        }
      }
    }

    void verifyRecoverySession();

    const subscription = supabase?.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN' || event === 'USER_UPDATED') {
        setHasValidSession(Boolean(session?.user));
        setCheckingSession(false);
      }
    }).data.subscription;

    return () => {
      active = false;
      subscription?.unsubscribe();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);

    if (!supabase || !isSupabaseConfigured) {
      setErrorMsg('اتصال Supabase غير مهيأ.');
      return;
    }

    if (newPassword.length < 6) {
      setErrorMsg('يجب أن تتكون كلمة المرور الجديدة من 6 أحرف على الأقل.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMsg('كلمتا المرور غير متطابقتين. يرجى التأكد وإعادة الإدخال.');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (error) throw error;

      // تنظيف رابط الاستعادة من شريط العنوان إن وجد
      if (window.location.search || window.location.hash) {
        window.history.replaceState({}, document.title, window.location.pathname);
      }

      setNewPassword('');
      setConfirmPassword('');
      onSuccess('تم تحديث كلمة المرور الجديدة بنجاح.');
    } catch (err) {
      setErrorMsg(
        getSupabaseErrorMessage(err, 'تعذر تحديث كلمة المرور الجديدة.')
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="reset-password-title"
    >
      <div className="w-full max-w-md rounded-xl border border-[#E5E0D5] bg-white shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b border-[#E5E0D5] px-6 py-4">
          <div>
            <p className="text-xs font-medium text-[#92400E]">تأمين الحساب</p>
            <h3
              id="reset-password-title"
              className="font-heritage mt-0.5 text-xl font-bold text-[#1C1917]"
            >
              تعيين كلمة المرور الجديدة
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
          {checkingSession ? (
            <div className="flex items-center justify-center gap-2 py-8 text-xs text-[#57534E]">
              <Loader2 className="h-4 w-4 animate-spin text-[#14532D]" />
              <span>جاري التحقق من صلاحية رابط الاستعادة...</span>
            </div>
          ) : !hasValidSession ? (
            <div className="space-y-4">
              <div className="flex items-start gap-2.5 rounded-lg border border-[#FCA5A5] bg-[#FEF2F2] p-3.5 text-xs leading-relaxed text-[#991B1B]">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  رابط استعادة كلمة المرور غير صالح أو انتهت صلاحيته. يرجى العودة وطلب رابط جديد أو استخدام رمز التحقق عبر الهاتف.
                </span>
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg bg-[#14532D] px-5 py-2 text-xs font-medium text-white hover:bg-[#166534] transition-colors cursor-pointer"
                >
                  العودة لتسجيل الدخول
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="flex items-start gap-2.5 rounded-lg border border-[#86EFAC] bg-[#F0FDF4] p-3 text-xs leading-relaxed text-[#166534]">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                <span>تم التحقق من هويتك بنجاح. أدخل كلمة المرور الجديدة لحفظها في حسابك.</span>
              </div>

              {errorMsg && (
                <div className="flex items-start gap-2.5 rounded-lg border border-[#FCA5A5] bg-[#FEF2F2] p-3.5 text-xs leading-relaxed text-[#991B1B]">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <div>
                <label className="mb-1.5 block text-xs font-medium text-[#1C1917]">
                  كلمة المرور الجديدة
                </label>
                <div className="relative">
                  <input
                    type={showNew ? 'text' : 'password'}
                    required
                    minLength={6}
                    dir="ltr"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="6 أحرف على الأقل"
                    className="w-full rounded-lg border border-[#D6CEBE] bg-[#FAF8F4] py-2.5 pr-3.5 pl-10 text-sm text-[#1C1917] focus:border-[#14532D] focus:bg-white focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNew((prev) => !prev)}
                    aria-label={showNew ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-[#78716C] hover:text-[#1C1917] cursor-pointer"
                  >
                    {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-[#1C1917]">
                  تأكيد كلمة المرور الجديدة
                </label>
                <div className="relative">
                  <input
                    type={showConfirm ? 'text' : 'password'}
                    required
                    minLength={6}
                    dir="ltr"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="أعد إدخال كلمة المرور"
                    className="w-full rounded-lg border border-[#D6CEBE] bg-[#FAF8F4] py-2.5 pr-3.5 pl-10 text-sm text-[#1C1917] focus:border-[#14532D] focus:bg-white focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm((prev) => !prev)}
                    aria-label={showConfirm ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-[#78716C] hover:text-[#1C1917] cursor-pointer"
                  >
                    {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg border border-[#E5E0D5] bg-white px-4 py-2 text-xs font-medium text-[#57534E] hover:bg-[#FAF8F4] transition-colors cursor-pointer"
                >
                  تخطي الآن
                </button>
                <button
                  type="submit"
                  disabled={loading || !isSupabaseConfigured}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#14532D] px-5 py-2 text-xs font-medium text-white hover:bg-[#166534] disabled:opacity-50 transition-colors cursor-pointer"
                >
                  {loading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <KeyRound className="h-3.5 w-3.5" />
                  )}
                  <span>حفظ كلمة المرور الجديدة</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
