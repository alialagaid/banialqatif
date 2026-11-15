import React, { useState } from 'react';
import {
  AlertCircle,
  Award,
  Check,
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  Headphones,
  KeyRound,
  Loader2,
  MessageCircle,
  UserPlus,
} from 'lucide-react';
import {
  getSupabaseErrorMessage,
  isSupabaseConfigured,
  supabase,
  supabaseConfigIssue,
} from '../lib/supabase';
import type { InvitationCode } from '../types/database';
import { normalizeArabicDigits } from '../utils/kinship';
import { AccountRecoveryModal } from './AccountRecoveryModal';

interface AuthScreenProps {
  onAuthSuccess: () => void;
  onHoldAuthRedirect?: (hold: boolean) => void;
}

type AuthMode = 'login' | 'register' | 'membership';

export const AuthScreen: React.FC<AuthScreenProps> = ({
  onAuthSuccess,
  onHoldAuthRedirect,
}) => {
  const [mode, setMode] = useState<AuthMode>('login');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isRecoveryOpen, setIsRecoveryOpen] = useState(false);
  const [copiedPhone, setCopiedPhone] = useState(false);

  const DEVELOPER_PHONE = '07800120887';
  const DEVELOPER_WHATSAPP_URL = 'https://wa.me/9647800120887';

  async function handleCopyDeveloperPhone() {
    try {
      await navigator.clipboard.writeText(DEVELOPER_PHONE);
    } catch {
      const tempInput = document.createElement('textarea');
      tempInput.value = DEVELOPER_PHONE;
      tempInput.setAttribute('readonly', '');
      tempInput.style.position = 'fixed';
      tempInput.style.opacity = '0';
      document.body.appendChild(tempInput);
      tempInput.select();
      document.execCommand('copy');
      document.body.removeChild(tempInput);
    }
    setCopiedPhone(true);
    window.setTimeout(() => setCopiedPhone(false), 2200);
  }

  // حقول تسجيل الدخول
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  // حقول إنشاء حساب بكود الدعوة
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [showRegConfirmPassword, setShowRegConfirmPassword] = useState(false);
  const [inviteCode, setInviteCode] = useState('');

  // حقول طلب الانضمام المباشر (membership_requests)
  const [reqName, setReqName] = useState('');
  const [reqEmail, setReqEmail] = useState('');
  const [reqPassword, setReqPassword] = useState('');
  const [reqConfirmPassword, setReqConfirmPassword] = useState('');
  const [showReqPassword, setShowReqPassword] = useState(false);
  const [showReqConfirmPassword, setShowReqConfirmPassword] = useState(false);
  const [reqPhone, setReqPhone] = useState('');
  const [reqLineage, setReqLineage] = useState('');

  function resetMessages() {
    setErrorMsg(null);
    setSuccessMsg(null);
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    resetMessages();
    if (!supabase) {
      setErrorMsg('اتصال Supabase غير مهيأ. يرجى ضبط متغيرات البيئة أولاً.');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: loginEmail.trim(),
        password: loginPassword,
      });
      if (error) throw error;
      onAuthSuccess();
    } catch (err) {
      setErrorMsg(
        getSupabaseErrorMessage(err, 'تعذر تسجيل الدخول. تحقق من البريد وكلمة المرور.')
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleRegisterWithCode(e: React.FormEvent) {
    e.preventDefault();
    resetMessages();
    if (!supabase) {
      setErrorMsg('اتصال Supabase غير مهيأ. يرجى ضبط متغيرات البيئة أولاً.');
      return;
    }

    const cleanCode = inviteCode.trim();
    if (!cleanCode) {
      setErrorMsg('يرجى إدخال كود الدعوة الممنوح من المالك أو المشرف.');
      return;
    }

    if (regPassword.length < 6) {
      setErrorMsg('يجب أن تتكون كلمة المرور من 6 أحرف على الأقل.');
      return;
    }

    if (regPassword !== regConfirmPassword) {
      setErrorMsg('كلمتا المرور غير متطابقتين. يرجى التأكد وإعادة كتابة كلمة المرور بشكل مطابق.');
      return;
    }

    setLoading(true);
    try {
      // 1. التحقق من صحة كود الدعوة في جدول invitation_codes
      const { data: codeRow, error: codeErr } = await supabase
        .from('invitation_codes')
        .select('*')
        .eq('code', cleanCode)
        .maybeSingle<InvitationCode>();

      if (codeErr) {
        throw new Error('تعذر التحقق من كود الدعوة: ' + codeErr.message);
      }
      if (!codeRow) {
        throw new Error('كود الدعوة غير صحيح أو غير موجود.');
      }
      if (codeRow.is_used) {
        throw new Error('تم استخدام كود الدعوة هذا مسبقاً.');
      }
      if (codeRow.expires_at && new Date(codeRow.expires_at).getTime() < Date.now()) {
        throw new Error('انتهت صلاحية كود الدعوة.');
      }

      const normalizedPhone = normalizeArabicDigits(regPhone).trim() || null;

      const assignedRole = codeRow.role || 'subscriber';

      // 2. إنشاء حساب المستخدم في Supabase Auth
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: regEmail.trim(),
        password: regPassword,
        options: {
          data: {
            full_name: regName.trim(),
            invitation_code: cleanCode,
            role: assignedRole,
          },
        },
      });

      if (signUpError) throw signUpError;

      const userId = signUpData.user?.id;
      if (userId) {
        // 3. إنشاء سجل الملف الشخصي في جدول profiles بالصلاحية المحددة في الكود
        let { error: profileError } = await supabase.from('profiles').upsert({
          id: userId,
          full_name: regName.trim(),
          email: regEmail.trim(),
          phone: normalizedPhone,
          role: assignedRole,
        });

        if (profileError && profileError.code === '23514' && assignedRole === 'subscriber') {
          const retryRes = await supabase.from('profiles').upsert({
            id: userId,
            full_name: regName.trim(),
            email: regEmail.trim(),
            phone: normalizedPhone,
            role: 'member',
          });
          profileError = retryRes.error;
        }

        if (profileError) {
          console.error('Profile upsert note:', profileError.message);
        }

        // 4. تحديث حالة كود الدعوة كمستخدم
        const { error: markErr } = await supabase
          .from('invitation_codes')
          .update({
            is_used: true,
            used_by: userId,
          })
          .eq('id', codeRow.id);

        if (markErr) {
          await supabase
            .from('invitation_codes')
            .update({ is_used: true })
            .eq('id', codeRow.id);
        }

        // 5. توثيق طلب الانضمام كمقبول بكود دعوة مباشرة في الجدول
        await supabase.from('membership_requests').insert({
          user_id: userId,
          full_name: regName.trim(),
          email: regEmail.trim(),
          phone: normalizedPhone,
          lineage_note: 'انضمام مباشر عبر كود دعوة معتمد',
          invitation_code_used: cleanCode,
          status: 'approved',
        });
      }

      if (signUpData.session) {
        onAuthSuccess();
      } else {
        setSuccessMsg(
          'تم إنشاء الحساب بنجاح! يرجى تأكيد بريدك الإلكتروني إن لزم الأمر ثم تسجيل الدخول.'
        );
        setMode('login');
      }
    } catch (err) {
      setErrorMsg(getSupabaseErrorMessage(err, 'حدث خطأ أثناء إنشاء الحساب.'));
    } finally {
      setLoading(false);
    }
  }

  async function handleMembershipRequest(e: React.FormEvent) {
    e.preventDefault();
    resetMessages();
    if (!supabase) {
      setErrorMsg('اتصال Supabase غير مهيأ. يرجى ضبط متغيرات البيئة أولاً.');
      return;
    }

    if (reqPassword.length < 6) {
      setErrorMsg('يجب أن تتكون كلمة المرور من 6 أحرف على الأقل.');
      return;
    }

    if (reqPassword !== reqConfirmPassword) {
      setErrorMsg('كلمتا المرور غير متطابقتين. يرجى التأكد وإعادة كتابة كلمة المرور بشكل مطابق.');
      return;
    }

    setLoading(true);
    onHoldAuthRedirect?.(true);
    try {
      const cleanName = reqName.trim();
      const cleanEmail = reqEmail.trim();
      const cleanPhone = normalizeArabicDigits(reqPhone).trim() || null;

      // 1. إنشاء حساب للعضو في Supabase Auth أولاً للحصول على user.id
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: cleanEmail,
        password: reqPassword,
        options: {
          data: {
            full_name: cleanName,
          },
        },
      });

      if (signUpError) throw signUpError;

      const userId = signUpData.user?.id;
      if (!userId) {
        throw new Error('تعذر الحصول على معرّف المستخدم (user.id) بعد إنشاء الحساب.');
      }

      // 2. إرسال بيانات طلب الانضمام إلى جدول membership_requests مرفقة بـ user_id وحالة pending
      const { error: reqErr } = await supabase.from('membership_requests').insert({
        user_id: userId,
        full_name: cleanName,
        email: cleanEmail,
        phone: cleanPhone,
        lineage_note: reqLineage.trim(),
        status: 'pending',
      });

      if (reqErr) throw reqErr;

      // إبقاء العضو في شاشة الانتظار حتى تتم مراجعة طلبه والموافقة عليه
      if (signUpData.session) {
        await supabase.auth.signOut();
      }

      setSuccessMsg(
        'تم إنشاء حسابك وإرسال طلب الانضمام بنجاح إلى المطور والمشرفين للمراجعة والموافقة.'
      );
      setReqName('');
      setReqEmail('');
      setReqPassword('');
      setReqConfirmPassword('');
      setReqPhone('');
      setReqLineage('');
    } catch (err) {
      setErrorMsg(getSupabaseErrorMessage(err, 'تعذر إرسال طلب الانضمام.'));
    } finally {
      onHoldAuthRedirect?.(false);
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto grid max-w-[1200px] grid-cols-1 items-stretch gap-8 px-6 py-10 lg:grid-cols-12">
      {/* العمود التعريفي التراثي */}
      <section className="flex flex-col justify-between rounded-xl border border-[#E5E0D5] bg-white p-7 lg:col-span-5">
        <div className="space-y-5">
          {/* الشعار والعنوان الرئيسي */}
          <div className="flex flex-col items-center rounded-xl border border-[#E5E0D5] bg-[#FAF8F4] p-5 text-center">
            <div className="h-36 w-36 overflow-hidden rounded-xl border-2 border-[#D6CEBE] bg-white shadow-sm">
              <img
                src="/assets/aistudio/image_6f64ce03_5e9cd2c7.jpg"
                alt="شعار آل مال الله - شجرة عشيرة بني القطيف"
                className="h-full w-full object-cover"
              />
            </div>
            <p className="mt-3.5 text-xs font-medium text-[#92400E]">
              آل مال الله · الأرشيف النسبي الرقمي
            </p>
            <h1 className="font-heritage mt-1 text-2xl sm:text-3xl font-bold text-[#1C1917] text-balance">
              شجرة عائلة بني قطيف
            </h1>
          </div>

          {/* 1. بطاقة المرجعية العشائرية */}
          <div className="rounded-xl border-2 border-[#C59B27] bg-gradient-to-b from-[#FFFDF7] to-[#FAF1D6] px-5 py-4 text-center shadow-xs">
            <div className="flex items-center justify-center gap-1.5 text-[11px] font-semibold text-[#92400E]">
              <Award className="h-3.5 w-3.5 text-[#B45309]" />
              <span>المرجعية العشائرية</span>
            </div>
            <p className="mt-1.5 text-xs font-medium text-[#78350F]">
              شيخ عشيرة القطيف العام
            </p>
            <p className="font-heritage mt-1 text-lg sm:text-xl font-bold text-[#1C1917] text-balance">
              الحاج محمد ياسين مال الله القطيفي
            </p>
          </div>

          {/* 2. بطاقة الدعم الفني والتواصل مع المطور */}
          <div className="rounded-xl border border-[#D6CEBE] bg-[#FAF8F4] p-4">
            <div className="flex items-center gap-2 text-xs font-bold text-[#1C1917]">
              <Headphones className="h-4 w-4 text-[#14532D]" />
              <h2>الدعم الفني وإدارة الموقع</h2>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex flex-col">
                <span className="text-[11px] text-[#57534E]">رقم المطور</span>
                <span
                  dir="ltr"
                  className="font-mono text-base font-bold tracking-wider text-[#1C1917] tabular-nums"
                >
                  {DEVELOPER_PHONE}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <a
                  href={DEVELOPER_WHATSAPP_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#14532D] px-3 py-2 text-xs font-medium text-white hover:bg-[#166534] transition-colors whitespace-nowrap shrink-0"
                >
                  <MessageCircle className="h-3.5 w-3.5" />
                  <span>واتساب المطور</span>
                </a>

                <button
                  type="button"
                  onClick={handleCopyDeveloperPhone}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#D6CEBE] bg-white px-3 py-2 text-xs font-medium text-[#1C1917] hover:bg-[#F2EFE9] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {copiedPhone ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-[#14532D]" />
                      <span className="text-[#14532D]">تم النسخ</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5 text-[#57534E]" />
                      <span>نسخ الرقم</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* 3. إرشادات وشروط الانضمام (معلومات مهمة) */}
          <div className="border-t border-[#E5E0D5] pt-5">
            <div className="mb-3 flex items-baseline justify-between gap-2">
              <h2 className="text-sm font-bold text-[#1C1917]">إرشادات وشروط الانضمام</h2>
              <span className="text-[11px] font-medium text-[#92400E]">معلومات مهمة</span>
            </div>

            <dl className="space-y-3 text-xs leading-relaxed text-[#57534E]">
              <div className="border-b border-[#F2EFE9] pb-2.5">
                <dt className="font-semibold text-[#1C1917]">توثيق الأنساب</dt>
                <dd className="mt-0.5">
                  هذه المنصة مخصصة لحفظ وتوثيق أجيال عشيرة بني قطيف (آل مال الله) وصلة الرحم.
                </dd>
              </div>

              <div className="border-b border-[#F2EFE9] pb-2.5">
                <dt className="font-semibold text-[#1C1917]">الرقابة والتدقيق</dt>
                <dd className="mt-0.5">
                  جميع طلبات إضافة الأفراد أو تعديل بيانات المواليد والوفيات تخضع لمراجعة وموافقة المالك أو المطور أو المشرفين لضمان دقة النسب.
                </dd>
              </div>

              <div>
                <dt className="font-semibold text-[#1C1917]">آلية التسجيل</dt>
                <dd className="mt-0.5">
                  للانضمام، استخدم تبويب{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setMode('register');
                      resetMessages();
                    }}
                    className="font-semibold text-[#14532D] underline decoration-[#14532D]/40 underline-offset-4 hover:decoration-[#14532D] cursor-pointer"
                  >
                    التسجيل بكود دعوة
                  </button>{' '}
                  إذا حصلت على كود من الإدارة، أو قدّم{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setMode('membership');
                      resetMessages();
                    }}
                    className="font-semibold text-[#14532D] underline decoration-[#14532D]/40 underline-offset-4 hover:decoration-[#14532D] cursor-pointer"
                  >
                    طلب انضمام جديد
                  </button>{' '}
                  وسيتم التواصل معك وتفعيل حسابك.
                </dd>
              </div>
            </dl>
          </div>
        </div>

        <div className="mt-6 border-t border-[#E5E0D5] pt-4 flex items-center justify-between text-xs text-[#57534E]">
          <span>بوابة الأنساب الرسمية لعائلة بني قطيف</span>
        </div>
      </section>

      {/* عمود نماذج الدخول والتسجيل وطلب الانضمام */}
      <section className="rounded-xl border border-[#E5E0D5] bg-white p-8 lg:col-span-7">
        {/* أزرار التبديل */}
        <div className="grid grid-cols-3 gap-1 rounded-lg bg-[#F2EFE9] p-1">
          <button
            type="button"
            onClick={() => {
              setMode('login');
              resetMessages();
            }}
            className={`rounded-md px-3 py-2 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
              mode === 'login'
                ? 'bg-white text-[#1C1917] shadow-xs'
                : 'text-[#57534E] hover:text-[#1C1917]'
            }`}
          >
            تسجيل الدخول
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('register');
              resetMessages();
            }}
            className={`rounded-md px-3 py-2 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
              mode === 'register'
                ? 'bg-white text-[#1C1917] shadow-xs'
                : 'text-[#57534E] hover:text-[#1C1917]'
            }`}
          >
            التسجيل بكود دعوة
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('membership');
              resetMessages();
            }}
            className={`rounded-md px-3 py-2 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
              mode === 'membership'
                ? 'bg-white text-[#1C1917] shadow-xs'
                : 'text-[#57534E] hover:text-[#1C1917]'
            }`}
          >
            طلب انضمام جديد
          </button>
        </div>

        {!isSupabaseConfigured && (
          <div className="mt-5 rounded-lg border border-[#F59E0B]/40 bg-[#FFFBEB] p-4 text-xs leading-relaxed text-[#92400E]">
            <strong>تنبيه تهيئة Supabase:</strong>{' '}
            {supabaseConfigIssue || (
              <>
                لم يتم العثور على <span className="font-mono">VITE_SUPABASE_URL</span> و{' '}
                <span className="font-mono">VITE_SUPABASE_ANON_KEY</span> في بيئة التشغيل.
              </>
            )}{' '}
            أضفهما في إعدادات البيئة (Secrets) لتفعيل المصادقة وحفظ البيانات.
          </div>
        )}

        {errorMsg && (
          <div className="mt-5 flex items-start gap-2.5 rounded-lg border border-[#FCA5A5] bg-[#FEF2F2] p-3.5 text-xs text-[#991B1B]">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="mt-5 flex items-start gap-2.5 rounded-lg border border-[#86EFAC] bg-[#F0FDF4] p-3.5 text-xs text-[#166534]">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {mode === 'login' && (
          <form onSubmit={handleLogin} className="mt-6 space-y-4">
            <div>
              <h2 className="text-xl font-bold text-[#1C1917]">دخول الأعضاء والإدارة</h2>
              <p className="mt-1 text-xs text-[#57534E]">
                سجل الدخول بحسابك المعتمد لاستعراض شجرة العائلة وصلاحياتك.
              </p>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#1C1917]">
                البريد الإلكتروني
              </label>
              <input
                type="email"
                required
                dir="ltr"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                placeholder="name@example.com"
                className="w-full rounded-lg border border-[#D6CEBE] bg-[#FAF8F4] px-3.5 py-2.5 text-sm text-[#1C1917] focus:border-[#14532D] focus:bg-white focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#1C1917]">
                كلمة المرور
              </label>
              <div className="relative">
                <input
                  type={showLoginPassword ? 'text' : 'password'}
                  required
                  dir="ltr"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-lg border border-[#D6CEBE] bg-[#FAF8F4] py-2.5 pr-3.5 pl-10 text-sm text-[#1C1917] focus:border-[#14532D] focus:bg-white focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowLoginPassword((prev) => !prev)}
                  aria-label={showLoginPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-[#78716C] hover:text-[#1C1917] cursor-pointer"
                >
                  {showLoginPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <div className="mt-2 flex items-center justify-start">
                <button
                  type="button"
                  onClick={() => {
                    resetMessages();
                    setIsRecoveryOpen(true);
                  }}
                  className="text-xs font-medium text-[#14532D] hover:text-[#166534] hover:underline cursor-pointer"
                >
                  نسيت كلمة المرور؟
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !isSupabaseConfigured}
              className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#14532D] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#166534] disabled:opacity-50 transition-colors cursor-pointer"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              <span>تسجيل الدخول</span>
            </button>
          </form>
        )}

        {mode === 'register' && (
          <form onSubmit={handleRegisterWithCode} className="mt-6 space-y-4">
            <div>
              <h2 className="text-xl font-bold text-[#1C1917]">إنشاء حساب باستخدام كود الدعوة</h2>
              <p className="mt-1 text-xs text-[#57534E]">
                يُتحقق من كود الدعوة الممنوح من الإدارة ليتم تفعيل حسابك وصلاحياتك مباشرة.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[#1C1917]">
                  الاسم الكامل
                </label>
                <input
                  type="text"
                  required
                  value={regName}
                  onChange={(e) => setRegName(e.target.value)}
                  placeholder="مثال: عبد الله بن محمد القطيفي"
                  className="w-full rounded-lg border border-[#D6CEBE] bg-[#FAF8F4] px-3.5 py-2.5 text-sm text-[#1C1917] focus:border-[#14532D] focus:bg-white focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[#1C1917]">
                  كود الدعوة
                </label>
                <div className="relative">
                  <KeyRound className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#78716C]" />
                  <input
                    type="text"
                    required
                    dir="ltr"
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value)}
                    placeholder="QATIF-XXXX"
                    className="w-full rounded-lg border border-[#D6CEBE] bg-[#FAF8F4] py-2.5 pr-9 pl-3.5 font-mono text-sm text-[#1C1917] focus:border-[#14532D] focus:bg-white focus:outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[#1C1917]">
                  البريد الإلكتروني
                </label>
                <input
                  type="email"
                  required
                  dir="ltr"
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                  placeholder="member@example.com"
                  className="w-full rounded-lg border border-[#D6CEBE] bg-[#FAF8F4] px-3.5 py-2.5 text-sm text-[#1C1917] focus:border-[#14532D] focus:bg-white focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[#1C1917]">
                  رقم الجوال (اختياري)
                </label>
                <input
                  type="tel"
                  dir="ltr"
                  value={regPhone}
                  onChange={(e) => setRegPhone(e.target.value)}
                  placeholder="05XXXXXXXX"
                  className="w-full rounded-lg border border-[#D6CEBE] bg-[#FAF8F4] px-3.5 py-2.5 font-mono text-sm text-[#1C1917] focus:border-[#14532D] focus:bg-white focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[#1C1917]">
                  كلمة المرور
                </label>
                <div className="relative">
                  <input
                    type={showRegPassword ? 'text' : 'password'}
                    required
                    minLength={6}
                    dir="ltr"
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    placeholder="6 أحرف على الأقل"
                    className="w-full rounded-lg border border-[#D6CEBE] bg-[#FAF8F4] py-2.5 pr-3.5 pl-10 text-sm text-[#1C1917] focus:border-[#14532D] focus:bg-white focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowRegPassword((prev) => !prev)}
                    aria-label={showRegPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-[#78716C] hover:text-[#1C1917] cursor-pointer"
                  >
                    {showRegPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-[#1C1917]">
                  تأكيد كلمة المرور
                </label>
                <div className="relative">
                  <input
                    type={showRegConfirmPassword ? 'text' : 'password'}
                    required
                    minLength={6}
                    dir="ltr"
                    value={regConfirmPassword}
                    onChange={(e) => setRegConfirmPassword(e.target.value)}
                    placeholder="إعادة كتابة كلمة المرور"
                    className={`w-full rounded-lg border bg-[#FAF8F4] py-2.5 pr-3.5 pl-10 text-sm text-[#1C1917] focus:bg-white focus:outline-none ${
                      regConfirmPassword && regPassword !== regConfirmPassword
                        ? 'border-[#DC2626] focus:border-[#DC2626]'
                        : 'border-[#D6CEBE] focus:border-[#14532D]'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowRegConfirmPassword((prev) => !prev)}
                    aria-label={showRegConfirmPassword ? 'إخفاء تأكيد كلمة المرور' : 'إظهار تأكيد كلمة المرور'}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-[#78716C] hover:text-[#1C1917] cursor-pointer"
                  >
                    {showRegConfirmPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                {regConfirmPassword && regPassword !== regConfirmPassword && (
                  <p className="mt-1 text-[11px] font-medium text-[#B91C1C]">
                    كلمتا المرور غير متطابقتين
                  </p>
                )}
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !isSupabaseConfigured}
              className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#14532D] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#166534] disabled:opacity-50 transition-colors cursor-pointer"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              <span>التحقق من الكود وإنشاء الحساب</span>
            </button>
          </form>
        )}

        {mode === 'membership' && (
          <form onSubmit={handleMembershipRequest} className="mt-6 space-y-4">
            <div>
              <h2 className="text-xl font-bold text-[#1C1917]">طلب انضمام لشجرة العائلة</h2>
              <p className="mt-1 text-xs text-[#57534E]">
                في حال عدم توفر كود دعوة، أرسل طلبك ليراجعه المالك أو المطور أو المشرفون ويتم تفعيل حسابك.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[#1C1917]">
                  الاسم الكامل
                </label>
                <input
                  type="text"
                  required
                  value={reqName}
                  onChange={(e) => setReqName(e.target.value)}
                  placeholder="الاسم الكامل مع الفخذ"
                  className="w-full rounded-lg border border-[#D6CEBE] bg-[#FAF8F4] px-3.5 py-2.5 text-sm text-[#1C1917] focus:border-[#14532D] focus:bg-white focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[#1C1917]">
                  البريد الإلكتروني
                </label>
                <input
                  type="email"
                  required
                  dir="ltr"
                  value={reqEmail}
                  onChange={(e) => setReqEmail(e.target.value)}
                  placeholder="applicant@example.com"
                  className="w-full rounded-lg border border-[#D6CEBE] bg-[#FAF8F4] px-3.5 py-2.5 text-sm text-[#1C1917] focus:border-[#14532D] focus:bg-white focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[#1C1917]">
                  كلمة المرور
                </label>
                <div className="relative">
                  <input
                    type={showReqPassword ? 'text' : 'password'}
                    required
                    minLength={6}
                    dir="ltr"
                    value={reqPassword}
                    onChange={(e) => setReqPassword(e.target.value)}
                    placeholder="6 أحرف على الأقل"
                    className="w-full rounded-lg border border-[#D6CEBE] bg-[#FAF8F4] py-2.5 pr-3.5 pl-10 text-sm text-[#1C1917] focus:border-[#14532D] focus:bg-white focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowReqPassword((prev) => !prev)}
                    aria-label={showReqPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-[#78716C] hover:text-[#1C1917] cursor-pointer"
                  >
                    {showReqPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[#1C1917]">
                  تأكيد كلمة المرور
                </label>
                <div className="relative">
                  <input
                    type={showReqConfirmPassword ? 'text' : 'password'}
                    required
                    minLength={6}
                    dir="ltr"
                    value={reqConfirmPassword}
                    onChange={(e) => setReqConfirmPassword(e.target.value)}
                    placeholder="إعادة كتابة كلمة المرور"
                    className={`w-full rounded-lg border bg-[#FAF8F4] py-2.5 pr-3.5 pl-10 text-sm text-[#1C1917] focus:bg-white focus:outline-none ${
                      reqConfirmPassword && reqPassword !== reqConfirmPassword
                        ? 'border-[#DC2626] focus:border-[#DC2626]'
                        : 'border-[#D6CEBE] focus:border-[#14532D]'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowReqConfirmPassword((prev) => !prev)}
                    aria-label={showReqConfirmPassword ? 'إخفاء تأكيد كلمة المرور' : 'إظهار تأكيد كلمة المرور'}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-[#78716C] hover:text-[#1C1917] cursor-pointer"
                  >
                    {showReqConfirmPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                {reqConfirmPassword && reqPassword !== reqConfirmPassword && (
                  <p className="mt-1 text-[11px] font-medium text-[#B91C1C]">
                    كلمتا المرور غير متطابقتين
                  </p>
                )}
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#1C1917]">
                رقم الجوال
              </label>
              <input
                type="tel"
                dir="ltr"
                value={reqPhone}
                onChange={(e) => setReqPhone(normalizeArabicDigits(e.target.value))}
                placeholder="05XXXXXXXX"
                className="w-full rounded-lg border border-[#D6CEBE] bg-[#FAF8F4] px-3.5 py-2.5 font-mono text-sm text-[#1C1917] focus:border-[#14532D] focus:bg-white focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#1C1917]">
                توضيح صلة القرابة بالعائلة
              </label>
              <textarea
                required
                rows={3}
                value={reqLineage}
                onChange={(e) => setReqLineage(e.target.value)}
                placeholder="اذكر اسم الجد أو الفرع الذي تنتمي إليه لتسهيل المراجعة..."
                className="w-full rounded-lg border border-[#D6CEBE] bg-[#FAF8F4] px-3.5 py-2.5 text-sm text-[#1C1917] focus:border-[#14532D] focus:bg-white focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={loading || !isSupabaseConfigured}
              className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#14532D] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#166534] disabled:opacity-50 transition-colors cursor-pointer"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              <span>إرسال طلب الانضمام للمالك</span>
            </button>
          </form>
        )}
      </section>

      {isRecoveryOpen && (
        <AccountRecoveryModal
          initialEmail={loginEmail}
          onClose={() => setIsRecoveryOpen(false)}
        />
      )}
    </main>
  );
};
