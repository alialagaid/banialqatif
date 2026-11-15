import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, Check, CheckCircle2, HeartPulse, Loader2, Lock, UserPlus, X } from 'lucide-react';
import { getSupabaseErrorMessage, supabase } from '../lib/supabase';
import type { FamilyPerson, Profile } from '../types/database';
import {
  getPersonBirthDisplay,
  getPersonDeathDisplay,
  getPersonTribeTitle,
  persistFamilyPersonToDb,
} from '../utils/familyPersonDb';
import { isPrivilegedRole, normalizeArabicDigits } from '../utils/kinship';

export type EditModalMode = 'request-update' | 'request-create' | 'direct-update' | 'direct-create';

export interface ChangeRequestSuccessOptions {
  savedPerson?: FamilyPerson;
  keepOpen?: boolean;
}

interface ChangeRequestModalProps {
  isOpen: boolean;
  mode: EditModalMode;
  targetPerson: FamilyPerson | null;
  defaultFather: FamilyPerson | null;
  people: FamilyPerson[];
  profile: Profile;
  onClose: () => void;
  onSuccess: (message: string, options?: ChangeRequestSuccessOptions) => void;
  onError?: (message: string) => void;
}

function computeGenerationFromFather(selectedFatherId: string, peopleList: FamilyPerson[]): number {
  if (!selectedFatherId) return 1;
  const father = peopleList.find((p) => p.id === selectedFatherId);
  if (!father) return 1;
  const fatherGen =
    typeof father.generation === 'number' && father.generation >= 1 ? father.generation : 1;
  return fatherGen + 1;
}

export const ChangeRequestModal: React.FC<ChangeRequestModalProps> = ({
  isOpen,
  mode,
  targetPerson,
  defaultFather,
  people,
  profile,
  onClose,
  onSuccess,
  onError,
}) => {
  const [activeMode, setActiveMode] = useState<EditModalMode>(mode);
  const [activeTarget, setActiveTarget] = useState<FamilyPerson | null>(targetPerson);

  const hasPrivilegedAuthority = isPrivilegedRole(profile.role);
  const isDirect =
    hasPrivilegedAuthority && (activeMode === 'direct-update' || activeMode === 'direct-create');
  const isCreate = activeMode === 'request-create' || activeMode === 'direct-create';

  const initialFatherId = isCreate ? defaultFather?.id || '' : targetPerson?.father_id || '';

  const [fullName, setFullName] = useState(
    isCreate ? '' : targetPerson?.full_name || ''
  );
  const [fatherId, setFatherId] = useState(initialFatherId);
  const [gender, setGender] = useState<'male' | 'female'>(
    (targetPerson?.gender as 'male' | 'female') || 'male'
  );
  const [generation, setGeneration] = useState<number>(() =>
    computeGenerationFromFather(initialFatherId, people)
  );
  const [tribeTitle, setTribeTitle] = useState(
    isCreate ? getPersonTribeTitle(defaultFather) : getPersonTribeTitle(targetPerson)
  );
  const [birthDate, setBirthDate] = useState(
    isCreate ? '' : getPersonBirthDisplay(targetPerson)
  );
  const [deathDate, setDeathDate] = useState(
    isCreate ? '' : getPersonDeathDisplay(targetPerson)
  );
  const [isAlive, setIsAlive] = useState<boolean>(
    isCreate ? true : targetPerson?.is_alive !== false
  );
  const [location, setLocation] = useState(
    isCreate ? '' : targetPerson?.location || ''
  );
  const [phone, setPhone] = useState(
    isCreate ? '' : targetPerson?.phone || ''
  );
  const [biography, setBiography] = useState(
    isCreate ? '' : targetPerson?.biography || ''
  );
  const [reason, setReason] = useState('');

  const [loadingFullDetails, setLoadingFullDetails] = useState(false);
  const [submittingAction, setSubmittingAction] = useState<'close' | 'another' | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [inlineSuccessMsg, setInlineSuccessMsg] = useState<string | null>(null);
  const [inheritedFromFatherName, setInheritedFromFatherName] = useState<string | null>(() => {
    if (!isCreate || !defaultFather) return null;
    return getPersonTribeTitle(defaultFather) ? defaultFather.full_name : null;
  });

  const fullNameInputRef = useRef<HTMLInputElement | null>(null);

  // جلب التفاصيل الكاملة عند فتح نافذة التعديل لبيانات محملة بشكل خفيف
  useEffect(() => {
    if (!isOpen || isCreate || !activeTarget?.id || !supabase) return;

    const alreadyHasDetails =
      activeTarget.biography !== undefined &&
      activeTarget.location !== undefined &&
      activeTarget.phone !== undefined;

    if (alreadyHasDetails) return;

    let cancelled = false;

    async function fetchFullTargetDetails() {
      if (!supabase || !activeTarget?.id) return;
      setLoadingFullDetails(true);
      try {
        const { data } = await supabase
          .from('family_people')
          .select('*')
          .eq('id', activeTarget.id)
          .maybeSingle<FamilyPerson>();

        if (cancelled || !data) return;
        setActiveTarget(data);
        setFullName(data.full_name || '');
        const resolvedFatherId = data.father_id || '';
        setFatherId(resolvedFatherId);
        setGeneration(computeGenerationFromFather(resolvedFatherId, people));
        setGender((data.gender as 'male' | 'female') || 'male');
        setTribeTitle(getPersonTribeTitle(data));
        setBirthDate(getPersonBirthDisplay(data));
        setDeathDate(getPersonDeathDisplay(data));
        setIsAlive(data.is_alive !== false);
        setLocation(data.location || '');
        setPhone(data.phone || '');
        setBiography(data.biography || '');
      } finally {
        if (!cancelled) setLoadingFullDetails(false);
      }
    }

    void fetchFullTargetDetails();

    return () => {
      cancelled = true;
    };
  }, [isOpen, isCreate, activeTarget?.id, activeTarget?.biography, activeTarget?.location, activeTarget?.phone, people]);

  // مزامنة رقم الجيل تلقائياً عند تغير الأب أو توفر بياناته
  useEffect(() => {
    setGeneration(computeGenerationFromFather(fatherId, people));
  }, [fatherId, people]);

  if (!isOpen) return null;

  async function handleFatherChange(nextFatherId: string) {
    const previousFather = people.find((p) => p.id === fatherId);
    const nextFather = people.find((p) => p.id === nextFatherId);

    setFatherId(nextFatherId);
    setGeneration(computeGenerationFromFather(nextFatherId, people));

    if (!nextFatherId) {
      const prevTribe = getPersonTribeTitle(previousFather);
      if (prevTribe && tribeTitle.trim() === prevTribe) {
        setTribeTitle('');
      }
      setInheritedFromFatherName(null);
      return;
    }

    let resolvedFatherTribe = getPersonTribeTitle(nextFather);
    if (!resolvedFatherTribe && supabase && nextFather && nextFather.tribe_title === undefined) {
      try {
        const { data } = await supabase
          .from('family_people')
          .select('tribe_title, branch_name')
          .eq('id', nextFatherId)
          .maybeSingle<{ tribe_title?: string | null; branch_name?: string | null }>();
        if (data) {
          resolvedFatherTribe = String(data.tribe_title || data.branch_name || '').trim();
        }
      } catch {
        // تجاهل الخطأ الاحتياطي
      }
    }

    if (resolvedFatherTribe) {
      setTribeTitle(resolvedFatherTribe);
      setInheritedFromFatherName(nextFather?.full_name || null);
    } else {
      setInheritedFromFatherName(null);
    }
  }

  async function submitEntry(keepOpenForSibling: boolean) {
    setErrorMsg(null);
    setInlineSuccessMsg(null);

    if (!supabase) {
      setErrorMsg('اتصال Supabase غير مهيأ.');
      return;
    }

    if (!fullName.trim()) {
      setErrorMsg('يرجى إدخال الاسم الكامل.');
      fullNameInputRef.current?.focus();
      return;
    }

    const toNullableText = (val: string) => {
      const trimmed = val.trim();
      return trimmed.length > 0 ? trimmed : null;
    };

    const toNullableEnglishDigits = (val: string) => {
      const converted = normalizeArabicDigits(val).trim();
      return converted.length > 0 ? converted : null;
    };

    const computedGeneration = computeGenerationFromFather(fatherId, people);

    const structuredData = {
      full_name: normalizeArabicDigits(fullName).trim(),
      tribe_title: toNullableText(tribeTitle),
      father_id: toNullableText(fatherId),
      gender,
      generation: computedGeneration,
      birth_date: toNullableEnglishDigits(birthDate),
      is_alive: isAlive,
      death_date: isAlive ? null : toNullableEnglishDigits(deathDate),
      location: toNullableText(location),
      phone: toNullableEnglishDigits(phone),
      biography: toNullableText(biography),
    };

    const reportError = (err: unknown) => {
      if (err && typeof err === 'object' && ('message' in err || 'details' in err)) {
        const pgErr = err as { message?: string; details?: string; hint?: string; code?: string };
        const pieces = [
          pgErr.code ? `[${pgErr.code}]` : '',
          pgErr.message || '',
          pgErr.details && pgErr.details !== pgErr.message ? `التفاصيل: ${pgErr.details}` : '',
          pgErr.hint ? `تلميح: ${pgErr.hint}` : '',
        ].filter(Boolean);
        const formatted = pieces.join(' — ') || getSupabaseErrorMessage(err, JSON.stringify(err));
        setErrorMsg(formatted);
        onError?.(formatted);
        return;
      }
      const realMessage = getSupabaseErrorMessage(
        err,
        'حدث خطأ غير معروف أثناء الاتصال بقاعدة بيانات Supabase.'
      );
      setErrorMsg(realMessage);
      onError?.(realMessage);
    };

    setSubmittingAction(keepOpenForSibling ? 'another' : 'close');
    try {
      let savedPerson: FamilyPerson | undefined;
      let successMessage = '';

      if (isDirect) {
        if (isCreate) {
          const { data: insertedRow, error } = await persistFamilyPersonToDb(
            'insert',
            structuredData,
            { createdBy: profile.id }
          );
          if (error) {
            reportError(error);
            return;
          }
          savedPerson = insertedRow ?? undefined;
          successMessage = `تمت إضافة "${structuredData.full_name}" إلى شجرة العائلة مباشرة.`;
        } else if (activeTarget) {
          const { data: updatedRow, error } = await persistFamilyPersonToDb(
            'update',
            structuredData,
            { targetId: activeTarget.id }
          );
          if (error) {
            reportError(error);
            return;
          }
          savedPerson = updatedRow ?? undefined;
          successMessage = `تم تحديث بيانات "${structuredData.full_name}" مباشرة.`;
        }
      } else {
        // للمشترك: لا يُعدّل جدول family_people مباشرة، بل يُرسل الطلب في proposed_data إلى change_requests
        const targetPersonId = isCreate ? null : activeTarget?.id ?? null;
        const primaryRequestType = isCreate ? 'add' : 'edit';
        const fallbackRequestType = isCreate ? 'create' : 'update';

        const buildInsertPayload = (reqType: string, includeTargetPersonId: boolean) => ({
          person_id: targetPersonId,
          ...(includeTargetPersonId ? { target_person_id: targetPersonId } : {}),
          requested_by: profile.id,
          requester_name: profile.full_name,
          request_type: reqType,
          proposed_data: structuredData,
          reason: toNullableText(reason),
          status: 'pending',
        });

        let includeTargetCol = true;
        let { error } = await supabase
          .from('change_requests')
          .insert(buildInsertPayload(primaryRequestType, includeTargetCol));

        if (
          error &&
          (error.code === 'PGRST204' || error.code === '42703') &&
          `${error.message || ''} ${error.details || ''}`.includes('target_person_id')
        ) {
          includeTargetCol = false;
          const retry = await supabase
            .from('change_requests')
            .insert(buildInsertPayload(primaryRequestType, includeTargetCol));
          error = retry.error;
        }

        if (error && error.code === '23514') {
          const retryLegacyType = await supabase
            .from('change_requests')
            .insert(buildInsertPayload(fallbackRequestType, includeTargetCol));
          error = retryLegacyType.error;
        }

        if (error) {
          reportError(error);
          return;
        }
        successMessage =
          'تم إرسال التعديلات بنجاح وبانتظار موافقة المطور أو المالك أو المشرفين.';
      }

      onSuccess(successMessage, { savedPerson, keepOpen: keepOpenForSibling });

      if (keepOpenForSibling) {
        if (!isCreate) {
          setActiveMode(isDirect ? 'direct-create' : 'request-create');
          setActiveTarget(null);
        }
        setFullName('');
        setBirthDate('');
        setDeathDate('');
        setIsAlive(true);
        setPhone('');
        setBiography('');
        setReason('');
        setInlineSuccessMsg(
          isDirect
            ? `تم حفظ "${structuredData.full_name}" بنجاح — أدخل بيانات الأخ التالي الآن.`
            : 'تم إرسال التعديلات بنجاح وبانتظار موافقة المطور أو المالك أو المشرفين — يمكنك الآن إدخال بيانات الأخ التالي.'
        );
        requestAnimationFrame(() => {
          fullNameInputRef.current?.focus();
        });
      } else {
        onClose();
      }
    } catch (err) {
      reportError(err);
    } finally {
      setSubmittingAction(null);
    }
  }

  function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    void submitEntry(false);
  }

  const titleMap: Record<EditModalMode, string> = {
    'request-update': `طلب تعديل بيانات: ${activeTarget?.full_name ?? ''}`,
    'request-create': 'إضافة فرد جديد للشجرة (بانتظار الموافقة)',
    'direct-update': `تعديل بيانات الفرد: ${activeTarget?.full_name ?? ''}`,
    'direct-create': 'إضافة فرد جديد مباشرة',
  };

  const selectedFather = fatherId ? people.find((p) => p.id === fatherId) : null;
  const submitting = submittingAction !== null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={titleMap[activeMode]}
    >
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-[#D6CEBE] bg-white p-6">
        <div className="flex items-start justify-between border-b border-[#E5E0D5] pb-4">
          <div>
            <h2 className="font-heritage text-xl font-bold text-[#1C1917]">
              {titleMap[activeMode]}
            </h2>
            <p className="mt-1 text-xs text-[#57534E]">
              {isDirect
                ? 'سيتم تحديث السجل في الشجرة مباشرة بصفتك من الإدارة.'
                : 'يُرسل الطلب بكامل البيانات المقترحة لمراجعة المطور أو المالك أو المشرفين قبل اعتماده في الشجرة.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className="rounded-md p-1 text-[#57534E] hover:bg-[#F2EFE9] cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {loadingFullDetails && (
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-[#E5E0D5] bg-[#FAF8F4] px-3 py-2 text-xs text-[#57534E]">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-[#14532D]" />
            <span>جاري تحميل التفاصيل الكاملة للفرد...</span>
          </div>
        )}

        {inlineSuccessMsg && (
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-[#86EFAC] bg-[#F0FDF4] p-3 text-xs font-medium text-[#166534]">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-[#14532D]" />
            <span>{inlineSuccessMsg}</span>
          </div>
        )}

        {errorMsg && (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-[#FCA5A5] bg-[#FEF2F2] p-3 text-xs text-[#991B1B]">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span dir="auto">{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleFormSubmit} className="mt-5 space-y-4">
          {/* الصف الأول: الاسم الكامل + اللقب / القبيلة أو الفخذ */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#1C1917]">
                الاسم الكامل
              </label>
              <input
                ref={fullNameInputRef}
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="مثال: محمد بن عبد الله"
                className="w-full rounded-lg border border-[#D6CEBE] bg-[#FAF8F4] px-3.5 py-2 text-sm text-[#1C1917] focus:border-[#14532D] focus:bg-white focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#1C1917]">
                اللقب / القبيلة أو الفخذ
              </label>
              <input
                type="text"
                value={tribeTitle}
                onChange={(e) => {
                  setTribeTitle(e.target.value);
                  setInheritedFromFatherName(null);
                }}
                placeholder="مثال: آل مال الله"
                className="w-full rounded-lg border border-[#D6CEBE] bg-[#FAF8F4] px-3.5 py-2 text-sm text-[#1C1917] focus:border-[#14532D] focus:bg-white focus:outline-none"
              />
              {inheritedFromFatherName && tribeTitle && (
                <p className="mt-1 text-[11px] font-medium text-[#14532D]">
                  موروث تلقائياً من الأب: {inheritedFromFatherName}
                </p>
              )}
            </div>
          </div>

          {/* الصف الثاني: الأب في الشجرة + رقم الجيل + الجنس */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#1C1917]">
                الأب في الشجرة
              </label>
              <select
                value={fatherId}
                onChange={(e) => void handleFatherChange(e.target.value)}
                className="w-full rounded-lg border border-[#D6CEBE] bg-[#FAF8F4] px-3.5 py-2 text-sm text-[#1C1917] focus:border-[#14532D] focus:bg-white focus:outline-none"
              >
                <option value="">بدون أب (جد مؤسس)</option>
                {people
                  .filter((p) => p.id !== activeTarget?.id)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.full_name}
                      {p.generation ? ` (الجيل ${p.generation})` : ''}
                    </option>
                  ))}
              </select>
            </div>

            <div>
              <label className="mb-1.5 flex items-center justify-between text-xs font-medium text-[#1C1917]">
                <span>رقم الجيل (تلقائي)</span>
                <Lock className="h-3 w-3 text-[#78716C]" aria-hidden="true" />
              </label>
              <input
                type="text"
                readOnly
                aria-readonly="true"
                value={String(generation)}
                tabIndex={-1}
                className="w-full cursor-not-allowed rounded-lg border border-[#D6CEBE] bg-[#F2EFE9] px-3.5 py-2 font-mono text-sm font-semibold tabular-nums text-[#57534E] focus:outline-none"
              />
              <p className="mt-1 text-[11px] text-[#78716C]">
                {selectedFather
                  ? `محسوب تلقائياً: جيل الأب (${selectedFather.generation ?? 1}) + 1`
                  : 'محسوب تلقائياً: جد مؤسس = الجيل 1'}
              </p>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#1C1917]">الجنس</label>
              <select
                value={gender}
                onChange={(e) => setGender(e.target.value as 'male' | 'female')}
                className="w-full rounded-lg border border-[#D6CEBE] bg-[#FAF8F4] px-3.5 py-2 text-sm text-[#1C1917] focus:border-[#14532D] focus:outline-none"
              >
                <option value="male">ذكر</option>
                <option value="female">أنثى</option>
              </select>
            </div>
          </div>

          {/* الصف الثالث: تاريخ أو سنة الميلاد + حالة الحياة + تاريخ أو سنة الوفاة */}
          <div className="rounded-xl border border-[#E5E0D5] bg-[#FAF8F4]/70 p-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[#1C1917]">
                  تاريخ أو سنة الميلاد
                </label>
                <input
                  type="text"
                  value={birthDate}
                  onChange={(e) => setBirthDate(normalizeArabicDigits(e.target.value))}
                  placeholder="مثال: 1965 أو 1965-04-12"
                  className="w-full rounded-lg border border-[#D6CEBE] bg-white px-3.5 py-2 text-sm text-[#1C1917] focus:border-[#14532D] focus:outline-none"
                />
              </div>

              <div>
                <span className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-[#1C1917]">
                  <HeartPulse className="h-3.5 w-3.5 text-[#14532D]" />
                  <span>حالة الحياة</span>
                </span>
                <div
                  role="radiogroup"
                  aria-label="حالة الحياة"
                  className="grid grid-cols-2 gap-2 rounded-lg border border-[#D6CEBE] bg-white p-1"
                >
                  <button
                    type="button"
                    role="radio"
                    aria-checked={isAlive}
                    onClick={() => {
                      setIsAlive(true);
                      setDeathDate('');
                    }}
                    className={`inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                      isAlive
                        ? 'bg-[#14532D] text-white shadow-xs'
                        : 'text-[#57534E] hover:bg-[#FAF8F4]'
                    }`}
                  >
                    <span
                      className={`h-2 w-2 rounded-full ${isAlive ? 'bg-[#86EFAC]' : 'bg-[#16A34A]'}`}
                    />
                    <span>على قيد الحياة</span>
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={!isAlive}
                    onClick={() => setIsAlive(false)}
                    className={`inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                      !isAlive
                        ? 'bg-[#57534E] text-white shadow-xs'
                        : 'text-[#57534E] hover:bg-[#FAF8F4]'
                    }`}
                  >
                    <span>متوفى</span>
                  </button>
                </div>
              </div>
            </div>

            {!isAlive && (
              <div className="mt-3.5 border-t border-[#E5E0D5] pt-3.5">
                <label className="mb-1.5 block text-xs font-semibold text-[#7F1D1D]">
                  تاريخ أو سنة الوفاة
                </label>
                <input
                  type="text"
                  value={deathDate}
                  onChange={(e) => setDeathDate(normalizeArabicDigits(e.target.value))}
                  placeholder="مثال: 2018 أو 2018-09-20 (رحمه الله)"
                  className="w-full rounded-lg border border-[#FCA5A5] bg-white px-3.5 py-2 text-sm text-[#1C1917] focus:border-[#B91C1C] focus:outline-none"
                />
              </div>
            )}
          </div>

          {/* الصف الرابع: مكان الإقامة + رقم الموبايل */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#1C1917]">
                مكان الإقامة
              </label>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="المدينة / المنطقة"
                className="w-full rounded-lg border border-[#D6CEBE] bg-[#FAF8F4] px-3.5 py-2 text-sm text-[#1C1917] focus:border-[#14532D] focus:bg-white focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#1C1917]">
                رقم الموبايل
              </label>
              <input
                type="tel"
                dir="ltr"
                value={phone}
                onChange={(e) => setPhone(normalizeArabicDigits(e.target.value))}
                placeholder="05XXXXXXXX"
                className="w-full rounded-lg border border-[#D6CEBE] bg-[#FAF8F4] px-3.5 py-2 font-mono text-sm text-[#1C1917] focus:border-[#14532D] focus:bg-white focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-[#1C1917]">
              نبذة تاريخية أو سيرة مختصرة
            </label>
            <textarea
              rows={2}
              value={biography}
              onChange={(e) => setBiography(e.target.value)}
              className="w-full rounded-lg border border-[#D6CEBE] bg-[#FAF8F4] px-3.5 py-2 text-sm text-[#1C1917] focus:border-[#14532D] focus:bg-white focus:outline-none"
            />
          </div>

          {!isDirect && (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#1C1917]">
                سبب الطلب أو ملاحظات للإدارة (اختياري)
              </label>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="مثال: تصحيح اللقب أو تحديث سنة الميلاد أو تسجيل الوفاة..."
                className="w-full rounded-lg border border-[#D6CEBE] bg-[#FAF8F4] px-3.5 py-2 text-sm text-[#1C1917] focus:border-[#14532D] focus:bg-white focus:outline-none"
              />
            </div>
          )}

          {errorMsg && (
            <div className="flex items-start gap-2 rounded-lg border border-[#FCA5A5] bg-[#FEF2F2] p-3 text-xs text-[#991B1B]">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span dir="auto">{errorMsg}</span>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2.5 border-t border-[#E5E0D5] pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-lg border border-[#D6CEBE] bg-white px-4 py-2 text-xs font-medium text-[#1C1917] hover:bg-[#F2EFE9] disabled:opacity-50 cursor-pointer"
            >
              إلغاء
            </button>

            <button
              type="button"
              disabled={submitting}
              onClick={() => void submitEntry(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#14532D] bg-[#FAF8F4] px-4 py-2 text-xs font-semibold text-[#14532D] hover:bg-[#DCFCE7]/50 disabled:opacity-50 cursor-pointer"
            >
              {submittingAction === 'another' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <UserPlus className="h-3.5 w-3.5" />
              )}
              <span>حفظ وإضافة أخ آخر</span>
            </button>

            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 rounded-lg bg-[#14532D] px-5 py-2 text-xs font-medium text-white hover:bg-[#166534] disabled:opacity-50 cursor-pointer"
            >
              {submittingAction === 'close' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="h-3.5 w-3.5" />
              )}
              <span>
                {isDirect
                  ? 'حفظ التغييرات'
                  : isCreate
                    ? 'إرسال طلب الإضافة'
                    : 'إرسال طلب التعديل'}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
