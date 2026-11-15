import React, { useRef, useState } from 'react';
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Mail,
  Save,
  User,
} from 'lucide-react';
import { getSupabaseErrorMessage, supabase } from '../lib/supabase';
import type { Profile } from '../types/database';
import { getRoleBadgeClasses, getRoleLabelArabic, normalizeArabicDigits } from '../utils/kinship';

interface AccountSettingsViewProps {
  profile: Profile;
  onProfileUpdated: (updated: Profile) => void;
  onNotify: (message: string, isError?: boolean) => void;
}

export const AccountSettingsView: React.FC<AccountSettingsViewProps> = ({
  profile,
  onProfileUpdated,
  onNotify,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // 1. الصورة الشخصية
  const [avatarUrl, setAvatarUrl] = useState<string>(profile.avatar_url || '');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);

  // 2. البيانات الأساسية في profiles
  const [fullName, setFullName] = useState(profile.full_name || '');
  const [nickname, setNickname] = useState(profile.nickname || '');
  const [phone, setPhone] = useState(profile.phone || '');
  const [savingBasic, setSavingBasic] = useState(false);
  const [basicError, setBasicError] = useState<string | null>(null);
  const [basicSuccess, setBasicSuccess] = useState<string | null>(null);

  // 3أ. تغيير البريد الإلكتروني
  const [newEmail, setNewEmail] = useState(profile.email || '');
  const [savingEmail, setSavingEmail] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailSuccess, setEmailSuccess] = useState<string | null>(null);

  // 3ب. تغيير كلمة المرور
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !supabase) return;

    setAvatarError(null);

    if (!file.type.startsWith('image/')) {
      setAvatarError('يرجى اختيار ملف صورة صالح (PNG, JPG, WebP).');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setAvatarError('حجم الصورة يجب ألا يتجاوز 5 ميجابايت.');
      return;
    }

    setUploadingAvatar(true);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const filePath = `${profile.id}/avatar-${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, {
          upsert: true,
          contentType: file.type,
        });

      if (uploadError) throw uploadError;

      const { data: publicData } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      const publicUrl = publicData.publicUrl;

      const { error: profileErr } = await supabase.from('profiles').upsert({
        id: profile.id,
        full_name: fullName.trim() || profile.full_name,
        nickname: nickname.trim() || null,
        phone: normalizeArabicDigits(phone).trim() || null,
        email: profile.email,
        role: profile.role,
        avatar_url: publicUrl,
      });

      if (profileErr) throw profileErr;

      setAvatarUrl(publicUrl);
      onProfileUpdated({
        ...profile,
        avatar_url: publicUrl,
      });
      onNotify('تم رفع الصورة الشخصية وحفظها بنجاح.');
    } catch (err) {
      const msg = getSupabaseErrorMessage(
        err,
        'تعذر رفع الصورة الشخصية إلى مجلد avatars.'
      );
      setAvatarError(msg);
      onNotify(msg, true);
    } finally {
      setUploadingAvatar(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }

  async function handleSaveBasicInfo(e: React.FormEvent) {
    e.preventDefault();
    setBasicError(null);
    setBasicSuccess(null);

    if (!supabase) {
      setBasicError('اتصال Supabase غير مهيأ.');
      return;
    }

    const cleanName = fullName.trim();
    if (!cleanName) {
      setBasicError('يرجى إدخال الاسم الكامل.');
      return;
    }

    const cleanNickname = nickname.trim() || null;
    const cleanPhone = normalizeArabicDigits(phone).trim() || null;

    setSavingBasic(true);
    try {
      const { error } = await supabase.from('profiles').upsert({
        id: profile.id,
        full_name: cleanName,
        nickname: cleanNickname,
        phone: cleanPhone,
        email: profile.email,
        role: profile.role,
        avatar_url: avatarUrl || profile.avatar_url || null,
      });

      if (error) throw error;

      const updated: Profile = {
        ...profile,
        full_name: cleanName,
        nickname: cleanNickname,
        phone: cleanPhone,
        avatar_url: avatarUrl || profile.avatar_url || null,
      };
      onProfileUpdated(updated);
      setBasicSuccess('تم حفظ البيانات الشخصية في جدول profiles بنجاح.');
      onNotify('تم حفظ البيانات الشخصية بنجاح.');
    } catch (err) {
      const msg = getSupabaseErrorMessage(err, 'تعذر حفظ البيانات الشخصية.');
      setBasicError(msg);
      onNotify(msg, true);
    } finally {
      setSavingBasic(false);
    }
  }

  async function handleUpdateEmail(e: React.FormEvent) {
    e.preventDefault();
    setEmailError(null);
    setEmailSuccess(null);

    if (!supabase) {
      setEmailError('اتصال Supabase غير مهيأ.');
      return;
    }

    const cleanEmail = newEmail.trim();
    if (!cleanEmail) {
      setEmailError('يرجى إدخال البريد الإلكتروني الجديد.');
      return;
    }

    setSavingEmail(true);
    try {
      const { data, error } = await supabase.auth.updateUser({
        email: cleanEmail,
      });
      if (error) throw error;

      if (data.user?.email === cleanEmail) {
        await supabase
          .from('profiles')
          .update({ email: cleanEmail })
          .eq('id', profile.id);
        onProfileUpdated({
          ...profile,
          email: cleanEmail,
        });
      }

      setEmailSuccess(
        'تم إرسال طلب تحديث البريد الإلكتروني. يرجى مراجعة بريدك الإلكتروني لتأكيد التغيير إذا طُلب منك ذلك.'
      );
      onNotify('تم إرسال طلب تغيير البريد الإلكتروني بنجاح.');
    } catch (err) {
      const msg = getSupabaseErrorMessage(err, 'تعذر تحديث البريد الإلكتروني.');
      setEmailError(msg);
      onNotify(msg, true);
    } finally {
      setSavingEmail(false);
    }
  }

  async function handleUpdatePassword(e: React.FormEvent) {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(null);

    if (!supabase) {
      setPasswordError('اتصال Supabase غير مهيأ.');
      return;
    }

    if (newPassword.length < 6) {
      setPasswordError('يجب أن تتكون كلمة المرور الجديدة من 6 أحرف على الأقل.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('كلمتا المرور غير متطابقتين. يرجى التأكد وإعادة الإدخال.');
      return;
    }

    setSavingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (error) throw error;

      setNewPassword('');
      setConfirmPassword('');
      setPasswordSuccess('تم تحديث كلمة المرور الجديدة بنجاح.');
      onNotify('تم تغيير كلمة المرور بنجاح.');
    } catch (err) {
      const msg = getSupabaseErrorMessage(err, 'تعذر تغيير كلمة المرور.');
      setPasswordError(msg);
      onNotify(msg, true);
    } finally {
      setSavingPassword(false);
    }
  }

  return (
    <section className="mx-auto max-w-[1000px] space-y-6 px-6 py-8">
      {/* رأس الصفحة */}
      <div className="rounded-xl border border-[#E5E0D5] bg-white p-6 md:p-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between border-b border-[#E5E0D5] pb-6">
          <div className="flex items-center gap-4">
            <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-[#D6CEBE] bg-[#FAF8F4] flex items-center justify-center">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={profile.full_name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <User className="h-9 w-9 text-[#78716C]" />
              )}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-bold text-[#1C1917]">{profile.full_name}</span>
                <span
                  className={`inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-bold ${getRoleBadgeClasses(profile.role)}`}
                >
                  {getRoleLabelArabic(profile.role)}
                </span>
              </div>
              <h1 className="font-heritage mt-1 text-2xl font-bold text-[#1C1917]">
                حسابي والملف الشخصي
              </h1>
              <p className="mt-1 text-xs text-[#57534E]">
                إدارة صورتك الشخصية، بياناتك في سجل العائلة، وإعدادات الدخول والأمان.
              </p>
            </div>
          </div>

          <div className="shrink-0">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={(e) => void handleAvatarChange(e)}
              className="hidden"
            />
            <button
              type="button"
              disabled={uploadingAvatar}
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-lg border border-[#D6CEBE] bg-[#FAF8F4] px-4 py-2.5 text-xs font-medium text-[#1C1917] hover:bg-[#F2EFE9] disabled:opacity-50 transition-colors cursor-pointer"
            >
              {uploadingAvatar ? (
                <Loader2 className="h-4 w-4 animate-spin text-[#14532D]" />
              ) : (
                <Camera className="h-4 w-4 text-[#14532D]" />
              )}
              <span>{uploadingAvatar ? 'جاري رفع الصورة...' : 'تغيير الصورة الشخصية'}</span>
            </button>
          </div>
        </div>

        {avatarError && (
          <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-[#FCA5A5] bg-[#FEF2F2] p-3.5 text-xs text-[#991B1B]">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span dir="auto">{avatarError}</span>
          </div>
        )}

        {/* قسم البيانات الأساسية */}
        <form onSubmit={handleSaveBasicInfo} className="mt-6 space-y-5">
          <div>
            <h2 className="text-base font-bold text-[#1C1917]">البيانات الأساسية</h2>
            <p className="mt-0.5 text-xs text-[#57534E]">
              تُحفظ هذه البيانات مباشرة في سجل ملفك الشخصي بجدول <span className="font-mono">profiles</span>.
            </p>
          </div>

          {basicError && (
            <div className="flex items-start gap-2.5 rounded-lg border border-[#FCA5A5] bg-[#FEF2F2] p-3.5 text-xs text-[#991B1B]">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span dir="auto">{basicError}</span>
            </div>
          )}

          {basicSuccess && (
            <div className="flex items-start gap-2.5 rounded-lg border border-[#86EFAC] bg-[#F0FDF4] p-3.5 text-xs text-[#166534]">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{basicSuccess}</span>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#1C1917]">
                الاسم الكامل
              </label>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="الاسم الكامل"
                className="w-full rounded-lg border border-[#D6CEBE] bg-[#FAF8F4] px-3.5 py-2.5 text-sm text-[#1C1917] focus:border-[#14532D] focus:bg-white focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#1C1917]">
                الكنية
              </label>
              <input
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="مثال: أبو علي، أبو جهاد"
                className="w-full rounded-lg border border-[#D6CEBE] bg-[#FAF8F4] px-3.5 py-2.5 text-sm text-[#1C1917] focus:border-[#14532D] focus:bg-white focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#1C1917]">
                رقم الهاتف
              </label>
              <input
                type="tel"
                dir="ltr"
                value={phone}
                onChange={(e) => setPhone(normalizeArabicDigits(e.target.value))}
                placeholder="05XXXXXXXX"
                className="w-full rounded-lg border border-[#D6CEBE] bg-[#FAF8F4] px-3.5 py-2.5 font-mono text-sm text-[#1C1917] focus:border-[#14532D] focus:bg-white focus:outline-none"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={savingBasic}
              className="inline-flex items-center gap-2 rounded-lg bg-[#14532D] px-5 py-2.5 text-xs font-medium text-white hover:bg-[#166534] disabled:opacity-50 transition-colors cursor-pointer"
            >
              {savingBasic ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              <span>حفظ البيانات الشخصية</span>
            </button>
          </div>
        </form>
      </div>

      {/* قسم إعدادات الأمان والدخول */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* تغيير البريد الإلكتروني */}
        <form
          onSubmit={handleUpdateEmail}
          className="flex flex-col justify-between rounded-xl border border-[#E5E0D5] bg-white p-6"
        >
          <div className="space-y-4">
            <div className="border-b border-[#F2EFE9] pb-3">
              <h2 className="text-base font-bold text-[#1C1917]">تغيير البريد الإلكتروني</h2>
              <p className="mt-0.5 text-xs text-[#57534E]">
                تحديث البريد الإلكتروني المرتبط بتسجيل الدخول لحسابك.
              </p>
            </div>

            {emailError && (
              <div className="flex items-start gap-2.5 rounded-lg border border-[#FCA5A5] bg-[#FEF2F2] p-3 text-xs text-[#991B1B]">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span dir="auto">{emailError}</span>
              </div>
            )}

            {emailSuccess && (
              <div className="flex items-start gap-2.5 rounded-lg border border-[#86EFAC] bg-[#F0FDF4] p-3 text-xs text-[#166534]">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{emailSuccess}</span>
              </div>
            )}

            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#1C1917]">
                البريد الإلكتروني الجديد
              </label>
              <input
                type="email"
                required
                dir="ltr"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="name@example.com"
                className="w-full rounded-lg border border-[#D6CEBE] bg-[#FAF8F4] px-3.5 py-2.5 text-sm text-[#1C1917] focus:border-[#14532D] focus:bg-white focus:outline-none"
              />
            </div>
          </div>

          <div className="mt-5 flex justify-end">
            <button
              type="submit"
              disabled={savingEmail}
              className="inline-flex items-center gap-2 rounded-lg border border-[#D6CEBE] bg-[#FAF8F4] px-4 py-2.5 text-xs font-medium text-[#1C1917] hover:bg-[#F2EFE9] disabled:opacity-50 transition-colors cursor-pointer"
            >
              {savingEmail ? (
                <Loader2 className="h-4 w-4 animate-spin text-[#14532D]" />
              ) : (
                <Mail className="h-4 w-4 text-[#14532D]" />
              )}
              <span>تحديث البريد الإلكتروني</span>
            </button>
          </div>
        </form>

        {/* تغيير كلمة المرور */}
        <form
          onSubmit={handleUpdatePassword}
          className="flex flex-col justify-between rounded-xl border border-[#E5E0D5] bg-white p-6"
        >
          <div className="space-y-4">
            <div className="border-b border-[#F2EFE9] pb-3">
              <h2 className="text-base font-bold text-[#1C1917]">تغيير كلمة المرور</h2>
              <p className="mt-0.5 text-xs text-[#57534E]">
                قم بتعيين كلمة مرور جديدة لا تقل عن 6 أحرف لحماية حسابك.
              </p>
            </div>

            {passwordError && (
              <div className="flex items-start gap-2.5 rounded-lg border border-[#FCA5A5] bg-[#FEF2F2] p-3 text-xs text-[#991B1B]">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span dir="auto">{passwordError}</span>
              </div>
            )}

            {passwordSuccess && (
              <div className="flex items-start gap-2.5 rounded-lg border border-[#86EFAC] bg-[#F0FDF4] p-3 text-xs text-[#166534]">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{passwordSuccess}</span>
              </div>
            )}

            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#1C1917]">
                كلمة المرور الجديدة
              </label>
              <div className="relative">
                <input
                  type={showNewPassword ? 'text' : 'password'}
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
                  onClick={() => setShowNewPassword((prev) => !prev)}
                  aria-label={showNewPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-[#78716C] hover:text-[#1C1917] cursor-pointer"
                >
                  {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#1C1917]">
                تأكيد كلمة المرور
              </label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  required
                  minLength={6}
                  dir="ltr"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="إعادة كتابة كلمة المرور"
                  className={`w-full rounded-lg border bg-[#FAF8F4] py-2.5 pr-3.5 pl-10 text-sm text-[#1C1917] focus:bg-white focus:outline-none ${
                    confirmPassword && newPassword !== confirmPassword
                      ? 'border-[#DC2626] focus:border-[#DC2626]'
                      : 'border-[#D6CEBE] focus:border-[#14532D]'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((prev) => !prev)}
                  aria-label={showConfirmPassword ? 'إخفاء تأكيد كلمة المرور' : 'إظهار تأكيد كلمة المرور'}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-[#78716C] hover:text-[#1C1917] cursor-pointer"
                >
                  {showConfirmPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              {confirmPassword && newPassword !== confirmPassword && (
                <p className="mt-1 text-[11px] font-medium text-[#B91C1C]">
                  كلمتا المرور غير متطابقتين
                </p>
              )}
            </div>
          </div>

          <div className="mt-5 flex justify-end">
            <button
              type="submit"
              disabled={savingPassword}
              className="inline-flex items-center gap-2 rounded-lg bg-[#14532D] px-5 py-2.5 text-xs font-medium text-white hover:bg-[#166534] disabled:opacity-50 transition-colors cursor-pointer"
            >
              {savingPassword ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <KeyRound className="h-4 w-4" />
              )}
              <span>حفظ كلمة المرور الجديدة</span>
            </button>
          </div>
        </form>
      </div>
    </section>
  );
};
