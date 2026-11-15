import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Copy,
  Edit3,
  KeyRound,
  Loader2,
  Lock,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  User,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { getSupabaseErrorMessage, supabase } from '../lib/supabase';
import type {
  ChangeRequest,
  FamilyPerson,
  InvitationCode,
  MembershipRequest,
  Profile,
  SecurityEvent,
  UserRole,
} from '../types/database';
import {
  getPersonBirthDisplay,
  getPersonDeathDisplay,
  getPersonTribeTitle,
  persistFamilyPersonToDb,
} from '../utils/familyPersonDb';
import {
  formatDateArabic,
  getRoleBadgeClasses,
  getRoleLabelArabic,
  getSeverityLabelArabic,
  getStatusLabelArabic,
  normalizeArabicDigits,
  normalizeUserRole,
} from '../utils/kinship';

interface OwnerDashboardProps {
  profile: Profile;
  people: FamilyPerson[];
  changeRequests: ChangeRequest[];
  membershipRequests: MembershipRequest[];
  invitationCodes: InvitationCode[];
  securityEvents: SecurityEvent[];
  allProfiles: Profile[];
  onRefreshAll: () => Promise<void>;
  onChangeRequestUpdated?: (
    updated: ChangeRequest,
    treeMutation?:
      | { type: 'delete'; targetId: string }
      | { type: 'create'; person: FamilyPerson }
      | { type: 'update'; person: FamilyPerson }
  ) => void;
  onMembershipRequestUpdated?: (
    updated: MembershipRequest,
    createdCode?: InvitationCode,
    upsertedProfile?: Profile
  ) => void;
  onCodeCreated?: (createdCode: InvitationCode) => void;
  onProfileUpdated?: (updatedProfile: Profile) => void;
  onSecurityEventResolved?: (eventId: string) => void;
  onNotify: (msg: string, isError?: boolean) => void;
}

type DashboardTab =
  | 'changes'
  | 'membership'
  | 'codes'
  | 'security'
  | 'subscribers'
  | 'profiles';

interface SubscriberRow {
  key: string;
  profileId: string | null;
  full_name: string;
  nickname: string | null;
  avatar_url: string | null;
  email: string | null;
  phone: string | null;
  role: UserRole;
  is_suspended: boolean;
  joined_at: string | null;
  linkedProfile: Profile | null;
}

export const OwnerDashboard: React.FC<OwnerDashboardProps> = ({
  profile,
  people,
  changeRequests,
  membershipRequests,
  invitationCodes,
  securityEvents,
  allProfiles,
  onRefreshAll,
  onChangeRequestUpdated,
  onMembershipRequestUpdated,
  onCodeCreated,
  onProfileUpdated,
  onSecurityEventResolved,
  onNotify,
}) => {
  const isOwnerRole = profile.role === 'owner';
  const isDeveloperRole = profile.role === 'developer';
  const isAdminRole = !isOwnerRole && !isDeveloperRole;
  const isOwner = isOwnerRole || isDeveloperRole;
  const [activeTab, setActiveTab] = useState<DashboardTab>(isOwner ? 'security' : 'changes');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [changesFilter, setChangesFilter] = useState<'pending' | 'history'>('pending');
  const [membershipFilter, setMembershipFilter] = useState<'pending' | 'history'>('pending');
  const [subscriberSearch, setSubscriberSearch] = useState('');
  const [newCodeRole, setNewCodeRole] = useState<UserRole>('subscriber');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const peopleMap = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);

  const pendingChanges = useMemo(
    () => changeRequests.filter((r) => r.status === 'pending'),
    [changeRequests]
  );
  const archivedChanges = useMemo(
    () => changeRequests.filter((r) => r.status !== 'pending'),
    [changeRequests]
  );
  const displayedChanges = changesFilter === 'pending' ? pendingChanges : archivedChanges;

  const pendingMemberships = useMemo(
    () => membershipRequests.filter((r) => r.status === 'pending'),
    [membershipRequests]
  );
  const archivedMemberships = useMemo(
    () => membershipRequests.filter((r) => r.status !== 'pending'),
    [membershipRequests]
  );
  const displayedMemberships =
    membershipFilter === 'pending' ? pendingMemberships : archivedMemberships;

  const unresolvedSecurity = useMemo(
    () => securityEvents.filter((e) => !e.resolved),
    [securityEvents]
  );

  const filteredSecurityEvents = useMemo(() => {
    if (severityFilter === 'all') return securityEvents;
    if (severityFilter === 'unresolved') return securityEvents.filter((e) => !e.resolved);
    return securityEvents.filter((e) => e.severity === severityFilter);
  }, [securityEvents, severityFilter]);

  // دمج قائمة المشتركين من جدول profiles و طلبات الانضمام المقبولة بدون تكرار
  const subscribers = useMemo<SubscriberRow[]>(() => {
    const approvedRequests = membershipRequests.filter((r) => r.status === 'approved');
    const consumedRequestIds = new Set<string>();

    const approvedByUserId = new Map<string, MembershipRequest>();
    const approvedByEmail = new Map<string, MembershipRequest>();
    for (const req of approvedRequests) {
      if (req.user_id) approvedByUserId.set(req.user_id, req);
      if (req.email) approvedByEmail.set(req.email.trim().toLowerCase(), req);
    }

    const rows: SubscriberRow[] = [];

    for (const prof of allProfiles) {
      const emailKey = prof.email?.trim().toLowerCase();
      const matchedReq =
        approvedByUserId.get(prof.id) || (emailKey ? approvedByEmail.get(emailKey) : undefined);
      if (matchedReq) {
        consumedRequestIds.add(matchedReq.id);
      }

      const suspended = prof.is_suspended === true || prof.role === 'suspended';

      rows.push({
        key: `prof-${prof.id}`,
        profileId: prof.id,
        full_name: prof.full_name || matchedReq?.full_name || 'عضو مسجل',
        nickname: prof.nickname ?? null,
        avatar_url: prof.avatar_url ?? null,
        email: prof.email ?? matchedReq?.email ?? null,
        phone: prof.phone ?? matchedReq?.phone ?? null,
        role: prof.role,
        is_suspended: suspended,
        joined_at: prof.created_at ?? matchedReq?.created_at ?? null,
        linkedProfile: prof,
      });
    }

    for (const req of approvedRequests) {
      if (consumedRequestIds.has(req.id)) continue;
      rows.push({
        key: `mem-${req.id}`,
        profileId: req.user_id ?? null,
        full_name: req.full_name || 'عضو مسجل',
        nickname: null,
        avatar_url: null,
        email: req.email,
        phone: req.phone ?? null,
        role: 'subscriber',
        is_suspended: false,
        joined_at: req.created_at,
        linkedProfile: null,
      });
    }

    return rows.sort((a, b) => {
      const ta = a.joined_at ? new Date(a.joined_at).getTime() : 0;
      const tb = b.joined_at ? new Date(b.joined_at).getTime() : 0;
      return tb - ta;
    });
  }, [allProfiles, membershipRequests]);

  const filteredSubscribers = useMemo(() => {
    const q = subscriberSearch.trim().toLowerCase();
    if (!q) return subscribers;
    return subscribers.filter(
      (s) =>
        (s.full_name || '').toLowerCase().includes(q) ||
        (s.nickname && s.nickname.toLowerCase().includes(q)) ||
        (s.email && s.email.toLowerCase().includes(q)) ||
        (s.phone && s.phone.toLowerCase().includes(q)) ||
        getRoleLabelArabic(s.is_suspended ? 'suspended' : s.role).toLowerCase().includes(q)
    );
  }, [subscribers, subscriberSearch]);

  async function handleApproveChange(req: ChangeRequest) {
    if (!supabase) return;
    setBusyId(req.id);
    try {
      const targetId = req.target_person_id || req.person_id;
      const target = targetId ? peopleMap.get(targetId) : undefined;
      let treeMutation:
        | { type: 'delete'; targetId: string }
        | { type: 'create'; person: FamilyPerson }
        | { type: 'update'; person: FamilyPerson }
        | undefined;

      const isDelete = req.request_type === 'delete';
      const isAdd =
        req.request_type === 'add' || req.request_type === 'create' || (!isDelete && !targetId);

      if (isDelete) {
        if (!targetId) {
          onNotify('لا يوجد معرّف للفرد المطلوب حذفه في هذا الطلب.', true);
          return;
        }
        const { error: deleteErr } = await supabase
          .from('family_people')
          .delete()
          .eq('id', targetId);
        if (deleteErr) {
          onNotify(getSupabaseErrorMessage(deleteErr, JSON.stringify(deleteErr)), true);
          return;
        }
        treeMutation = { type: 'delete', targetId };
      } else {
        const proposed = (req.proposed_data || {}) as Record<string, unknown>;
        const personPayload = {
          full_name: String(proposed.full_name || target?.full_name || '').trim(),
          tribe_title:
            (proposed.tribe_title as string | null) ??
            (proposed.branch_name as string | null) ??
            null,
          branch_name:
            (proposed.branch_name as string | null) ??
            (proposed.tribe_title as string | null) ??
            null,
          father_id: (proposed.father_id as string | null) || null,
          gender: (proposed.gender as string) || 'male',
          generation:
            Number(normalizeArabicDigits(String(proposed.generation ?? '1')).replace(/[^\d]/g, '')) ||
            1,
          birth_date:
            proposed.birth_date !== undefined && proposed.birth_date !== null
              ? normalizeArabicDigits(String(proposed.birth_date)).trim()
              : proposed.birth_year !== undefined && proposed.birth_year !== null
                ? normalizeArabicDigits(String(proposed.birth_year)).trim()
                : null,
          death_date:
            proposed.is_alive === false
              ? proposed.death_date !== undefined && proposed.death_date !== null
                ? normalizeArabicDigits(String(proposed.death_date)).trim()
                : proposed.death_year !== undefined && proposed.death_year !== null
                  ? normalizeArabicDigits(String(proposed.death_year)).trim()
                  : null
              : null,
          is_alive: proposed.is_alive !== false,
          location: (proposed.location as string | null) || null,
          phone: proposed.phone ? normalizeArabicDigits(String(proposed.phone)).trim() : null,
          biography: (proposed.biography as string | null) || null,
          nickname: (proposed.nickname as string | null) || null,
        };

        if (isAdd) {
          const insertRes = await persistFamilyPersonToDb('insert', personPayload, {
            createdBy: req.requested_by || profile.id,
          });
          if (insertRes.error) {
            onNotify(
              getSupabaseErrorMessage(insertRes.error, JSON.stringify(insertRes.error)),
              true
            );
            return;
          }
          if (insertRes.data) {
            treeMutation = { type: 'create', person: insertRes.data };
          }
        } else {
          const updateRes = await persistFamilyPersonToDb('update', personPayload, {
            targetId: targetId!,
          });
          if (updateRes.error) {
            onNotify(
              getSupabaseErrorMessage(updateRes.error, JSON.stringify(updateRes.error)),
              true
            );
            return;
          }
          if (updateRes.data) {
            treeMutation = { type: 'update', person: updateRes.data };
          }
        }
      }

      const reviewedAt = new Date().toISOString();
      const { error: reqErr } = await supabase
        .from('change_requests')
        .update({
          status: 'approved',
          reviewed_by: profile.id,
          reviewed_at: reviewedAt,
        })
        .eq('id', req.id);
      if (reqErr) {
        onNotify(getSupabaseErrorMessage(reqErr, JSON.stringify(reqErr)), true);
        return;
      }

      const updatedRequest: ChangeRequest = {
        ...req,
        status: 'approved',
        reviewed_by: profile.id,
        reviewed_at: reviewedAt,
      };
      onChangeRequestUpdated?.(updatedRequest, treeMutation);
      void onRefreshAll();

      onNotify(
        isDelete
          ? 'تمت الموافقة على طلب الحذف وحذف الفرد من شجرة العائلة.'
          : isAdd
            ? 'تمت الموافقة على طلب الإضافة وإدراج الفرد في الشجرة بنجاح.'
            : 'تمت الموافقة على طلب التعديل وتحديث بيانات الفرد في الشجرة.'
      );
    } catch (err) {
      onNotify(getSupabaseErrorMessage(err, 'حدث خطأ أثناء الاتصال بقاعدة البيانات.'), true);
    } finally {
      setBusyId(null);
    }
  }

  async function handleRejectChange(req: ChangeRequest) {
    if (!supabase) return;
    setBusyId(req.id);
    try {
      const reviewedAt = new Date().toISOString();
      const { error } = await supabase
        .from('change_requests')
        .update({
          status: 'rejected',
          reviewed_by: profile.id,
          reviewed_at: reviewedAt,
        })
        .eq('id', req.id);
      if (error) {
        onNotify(getSupabaseErrorMessage(error, JSON.stringify(error)), true);
        return;
      }

      const updatedRequest: ChangeRequest = {
        ...req,
        status: 'rejected',
        reviewed_by: profile.id,
        reviewed_at: reviewedAt,
      };
      onChangeRequestUpdated?.(updatedRequest);
      void onRefreshAll();
      onNotify('تم رفض طلب التعديل.');
    } catch (err) {
      onNotify(getSupabaseErrorMessage(err, 'حدث خطأ أثناء الاتصال بقاعدة البيانات.'), true);
    } finally {
      setBusyId(null);
    }
  }

  async function handleApproveMembership(req: MembershipRequest) {
    if (!supabase) return;
    setBusyId(req.id);
    try {
      // توليد كود دعوة تلقائي عند قبول طلب الانضمام
      const randomPart = Math.random().toString(36).substring(2, 7).toUpperCase();
      const generatedCode = `QATIF-${randomPart}`;

      let codeInsertRes = await supabase
        .from('invitation_codes')
        .insert({
          code: generatedCode,
          is_used: false,
          created_by: profile.id,
          role: 'subscriber',
        })
        .select('*')
        .maybeSingle<InvitationCode>();

      if (codeInsertRes.error && codeInsertRes.error.code === '23514') {
        codeInsertRes = await supabase
          .from('invitation_codes')
          .insert({
            code: generatedCode,
            is_used: false,
            created_by: profile.id,
            role: 'member',
          })
          .select('*')
          .maybeSingle<InvitationCode>();
      }

      const { data: insertedCode, error: codeErr } = codeInsertRes;
      if (codeErr) {
        onNotify(getSupabaseErrorMessage(codeErr, 'خطأ في إنشاء كود الدعوة'), true);
        return;
      }

      const { error: updErr } = await supabase
        .from('membership_requests')
        .update({
          status: 'approved',
          invitation_code_used: generatedCode,
          reviewed_by: profile.id,
        })
        .eq('id', req.id);
      if (updErr) {
        onNotify(getSupabaseErrorMessage(updErr, 'خطأ في تحديث طلب الانضمام'), true);
        return;
      }

      let upsertedProfile: Profile | undefined;
      if (req.user_id) {
        let profUpsertRes = await supabase
          .from('profiles')
          .upsert({
            id: req.user_id,
            full_name: req.full_name,
            email: req.email,
            phone: req.phone ?? null,
            role: 'subscriber',
          })
          .select('*')
          .maybeSingle<Profile>();

        if (profUpsertRes.error && profUpsertRes.error.code === '23514') {
          profUpsertRes = await supabase
            .from('profiles')
            .upsert({
              id: req.user_id,
              full_name: req.full_name,
              email: req.email,
              phone: req.phone ?? null,
              role: 'member',
            })
            .select('*')
            .maybeSingle<Profile>();
        }

        const savedProf = profUpsertRes.data;
        upsertedProfile = savedProf ?? {
          id: req.user_id,
          full_name: req.full_name,
          email: req.email,
          phone: req.phone ?? null,
          role: 'subscriber',
          created_at: req.created_at,
        };
      }

      const updatedMembership: MembershipRequest = {
        ...req,
        status: 'approved',
        invitation_code_used: generatedCode,
        reviewed_by: profile.id,
      };
      const codeObject: InvitationCode = insertedCode ?? {
        id: `local-${Date.now()}`,
        code: generatedCode,
        role: 'subscriber',
        is_used: false,
        created_by: profile.id,
        created_at: new Date().toISOString(),
      };

      onMembershipRequestUpdated?.(updatedMembership, codeObject, upsertedProfile);
      void onRefreshAll();
      onNotify(`تم قبول الطلب وتوليد كود الدعوة: ${generatedCode}`);
    } catch (err) {
      onNotify(getSupabaseErrorMessage(err, 'حدث خطأ غير متوقع أثناء قبول الطلب.'), true);
    } finally {
      setBusyId(null);
    }
  }

  async function handleRejectMembership(req: MembershipRequest) {
    if (!supabase) return;
    setBusyId(req.id);
    try {
      const { error } = await supabase
        .from('membership_requests')
        .update({
          status: 'rejected',
          reviewed_by: profile.id,
        })
        .eq('id', req.id);
      if (error) {
        onNotify(getSupabaseErrorMessage(error, 'خطأ في رفض الطلب'), true);
        return;
      }

      const updatedMembership: MembershipRequest = {
        ...req,
        status: 'rejected',
        reviewed_by: profile.id,
      };
      onMembershipRequestUpdated?.(updatedMembership);
      void onRefreshAll();
      onNotify('تم رفض طلب الانضمام.');
    } catch (err) {
      onNotify(getSupabaseErrorMessage(err, 'حدث خطأ أثناء رفض الطلب.'), true);
    } finally {
      setBusyId(null);
    }
  }

  async function handleGenerateCode() {
    if (!supabase) {
      onNotify('اتصال Supabase غير مهيأ. يرجى التحقق من متغيرات البيئة.', true);
      return;
    }
    setBusyId('new-code');
    try {
      const prefix = newCodeRole === 'admin' ? 'QATIF-ADM' : 'QATIF';
      const randomPart = Math.random().toString(36).substring(2, 7).toUpperCase();
      const code = `${prefix}-${randomPart}`;

      let insertRes = await supabase
        .from('invitation_codes')
        .insert({
          code,
          is_used: false,
          created_by: profile.id,
          role: newCodeRole,
        })
        .select('*')
        .maybeSingle<InvitationCode>();

      if (insertRes.error && insertRes.error.code === '23514' && newCodeRole === 'subscriber') {
        insertRes = await supabase
          .from('invitation_codes')
          .insert({
            code,
            is_used: false,
            created_by: profile.id,
            role: 'member',
          })
          .select('*')
          .maybeSingle<InvitationCode>();
      }

      const { data: inserted, error } = insertRes;

      if (error) {
        onNotify(getSupabaseErrorMessage(error, JSON.stringify(error)), true);
        return;
      }

      onCodeCreated?.(
        inserted ?? {
          id: `local-${Date.now()}`,
          code,
          role: newCodeRole,
          is_used: false,
          created_by: profile.id,
          created_at: new Date().toISOString(),
        }
      );
      void onRefreshAll();
      onNotify(`تم إنشاء كود الدعوة بنجاح: ${code}`);
    } catch (err) {
      onNotify(getSupabaseErrorMessage(err, 'حدث خطأ غير متوقع أثناء توليد الكود.'), true);
    } finally {
      setBusyId(null);
    }
  }

  async function handleResolveSecurityEvent(eventId: string) {
    if (!supabase || !isOwner) return;
    setBusyId(eventId);
    try {
      const { error } = await supabase
        .from('security_events')
        .update({ resolved: true })
        .eq('id', eventId);
      if (error) throw error;
      onSecurityEventResolved?.(eventId);
      void onRefreshAll();
      onNotify('تم اعتماد مراجعة الحدث الأمني وإغلاقه.');
    } catch (err) {
      onNotify(getSupabaseErrorMessage(err, 'تعذر تحديث سجل الأمان.'), true);
    } finally {
      setBusyId(null);
    }
  }

  async function handleUpdateUserRole(targetProfile: Profile, nextRole: UserRole) {
    if (!supabase || targetProfile.id === profile.id) return;

    if (isAdminRole) {
      onNotify('صلاحية المشرف للقراءة فقط ولا يمكنه تعديل رتب الأعضاء.', true);
      return;
    }

    const targetCurrentRole = normalizeUserRole(
      targetProfile.is_suspended ? 'suspended' : targetProfile.role
    );

    if (isDeveloperRole) {
      if (targetCurrentRole === 'owner' || targetCurrentRole === 'developer') {
        onNotify('حسابات المالك والمطورين محمية ولا يمكن تعديلها.', true);
        return;
      }
      if (nextRole === 'owner' || nextRole === 'developer') {
        onNotify('لا يملك المطور صلاحية الترقية إلى مطور أو مالك.', true);
        return;
      }
    }

    const nextSuspended = nextRole === 'suspended';
    setBusyId(targetProfile.id);

    try {
      let persistedRole: UserRole = nextRole;
      let { error } = await supabase
        .from('profiles')
        .update({ role: persistedRole, is_suspended: nextSuspended })
        .eq('id', targetProfile.id);

      if (
        error &&
        (error.code === '42703' ||
          error.code === 'PGRST204' ||
          (error.message || '').toLowerCase().includes('is_suspended'))
      ) {
        const retryWithoutFlag = await supabase
          .from('profiles')
          .update({ role: persistedRole })
          .eq('id', targetProfile.id);
        error = retryWithoutFlag.error;
      }

      if (error && error.code === '23514') {
        if (persistedRole === 'subscriber') {
          persistedRole = 'member';
          const fallbackRes = await supabase
            .from('profiles')
            .update({ role: persistedRole, is_suspended: nextSuspended })
            .eq('id', targetProfile.id);
          error = fallbackRes.error;
          if (
            error &&
            (error.code === '42703' ||
              (error.message || '').toLowerCase().includes('is_suspended'))
          ) {
            const retryPlain = await supabase
              .from('profiles')
              .update({ role: persistedRole })
              .eq('id', targetProfile.id);
            error = retryPlain.error;
          }
        } else if (persistedRole === 'suspended') {
          const fallbackSuspendFlag = await supabase
            .from('profiles')
            .update({ is_suspended: true })
            .eq('id', targetProfile.id);
          error = fallbackSuspendFlag.error;
          if (!error) {
            persistedRole = targetProfile.role;
          }
        }
      }

      if (error) throw error;

      onProfileUpdated?.({
        ...targetProfile,
        role: persistedRole,
        is_suspended: nextSuspended,
      });
      void onRefreshAll();
      onNotify(
        nextSuspended
          ? `تم إيقاف حساب ${targetProfile.full_name}.`
          : `تم تحديث رتبة ${targetProfile.full_name} إلى ${getRoleLabelArabic(nextRole)}.`
      );
    } catch (err) {
      onNotify(getSupabaseErrorMessage(err, 'تعذر تحديث الرتبة.'), true);
    } finally {
      setBusyId(null);
    }
  }

  function renderRoleManagementCell(
    targetProfile: Profile | null,
    effectiveRole: UserRole,
    fullName: string,
    isSelf: boolean,
    unlinkedLabel = 'بانتظار تفعيل الدخول'
  ) {
    if (isSelf) {
      return <span className="text-[#78716C]">حسابك الحالي</span>;
    }

    if (isAdminRole) {
      return <span className="text-[#78716C]">للقراءة فقط</span>;
    }

    if (!targetProfile) {
      return <span className="text-[#78716C]">{unlinkedLabel}</span>;
    }

    const isProtectedForDeveloper =
      isDeveloperRole && (effectiveRole === 'owner' || effectiveRole === 'developer');

    if (isProtectedForDeveloper) {
      return (
        <span className="inline-flex items-center gap-1 rounded border border-[#D4AF37]/70 bg-[#FEF3C7]/75 px-2.5 py-1 text-[11px] font-semibold text-[#92400E]">
          <Lock className="h-3 w-3 shrink-0" />
          <span>محمي - لا يمكن التعديل</span>
        </span>
      );
    }

    const selectValue = normalizeUserRole(effectiveRole);

    return (
      <select
        aria-label={`تغيير رتبة ${fullName}`}
        disabled={busyId === targetProfile.id}
        value={selectValue}
        onChange={(e) => void handleUpdateUserRole(targetProfile, e.target.value as UserRole)}
        className="rounded border border-[#D6CEBE] bg-white px-2.5 py-1 text-xs text-[#1C1917] focus:border-[#14532D] focus:outline-none disabled:opacity-50"
      >
        {isOwnerRole && selectValue === 'owner' && <option value="owner">مالك</option>}
        {isOwnerRole && <option value="developer">مطور</option>}
        <option value="admin">مشرف</option>
        <option value="subscriber">مشترك</option>
        <option value="suspended">إيقاف الحساب</option>
      </select>
    );
  }

  async function handleCopyCode(code: string) {
    await navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  }

  async function handleRecalculateGenerations() {
    if (!supabase) return;
    setBusyId('recalculate-generations');
    try {
      const { error } = await supabase.rpc('recalculate_all_generations');
      if (error) {
        onNotify(
          getSupabaseErrorMessage(error, 'تعذر تنفيذ إعادة ضبط الأجيال إلكترونياً.'),
          true
        );
        return;
      }
      await onRefreshAll();
      onNotify('تمت إعادة ضبط وتصحيح ترقيم كافة الأجيال في الشجرة إلكترونياً وتحديثها بنجاح.');
    } catch (err) {
      onNotify(
        getSupabaseErrorMessage(err, 'حدث خطأ أثناء الاتصال بقاعدة البيانات لإعادة حساب الأجيال.'),
        true
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="mx-auto max-w-[1440px] px-6 py-8">
      {/* شريط المؤشرات العلوي */}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-xl border border-[#E5E0D5] bg-white p-5">
          <p className="text-xs text-[#57534E]">أفراد الشجرة المسجلون</p>
          <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-[#1C1917]">
            {people.length}
          </p>
        </div>
        <div className="rounded-xl border border-[#E5E0D5] bg-white p-5">
          <p className="text-xs text-[#57534E]">طلبات التعديل المعلقة</p>
          <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-[#92400E]">
            {pendingChanges.length}
          </p>
        </div>
        <div className="rounded-xl border border-[#E5E0D5] bg-white p-5">
          <p className="text-xs text-[#57534E]">طلبات الانضمام المعلقة</p>
          <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-[#14532D]">
            {pendingMemberships.length}
          </p>
        </div>
        <div className="rounded-xl border border-[#E5E0D5] bg-white p-5">
          <p className="text-xs text-[#57534E]">
            {isOwner ? 'تنبيهات الأمان المفتوحة' : 'إجمالي المشتركين'}
          </p>
          <p
            className={`mt-2 font-mono text-2xl font-semibold tabular-nums ${
              isOwner && unresolvedSecurity.length > 0 ? 'text-[#B91C1C]' : 'text-[#1C1917]'
            }`}
          >
            {isOwner ? unresolvedSecurity.length : subscribers.length}
          </p>
        </div>
      </div>

      {/* الحاوية الرئيسية للوحة */}
      <div className="rounded-xl border border-[#E5E0D5] bg-white p-6">
        <div className="flex flex-col gap-4 border-b border-[#E5E0D5] pb-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-heritage text-2xl font-bold text-[#1C1917]">
                {isOwner ? 'لوحة تحكم المالك ومراقبة الأمان' : 'لوحة الإدارة واعتماد الطلبات'}
              </h2>
              <p className="mt-1 text-xs text-[#57534E]">
                مراجعة طلبات التعديل والانضمام مباشرة، إدارة أكواد الدعوة والمشتركين، ومراقبة سجل الأمان.
              </p>
            </div>

            <button
              type="button"
              disabled={busyId === 'recalculate-generations'}
              onClick={() => void handleRecalculateGenerations()}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#D4AF37] bg-[#0F2350] px-4 py-2 text-xs font-semibold text-[#F6DF85] hover:bg-[#16326E] disabled:opacity-60 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {busyId === 'recalculate-generations' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              <span>إعادة ضبط وتصحيح الأجيال إلكترونياً</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-1 rounded-lg bg-[#F2EFE9] p-1 self-start">
            {isOwner && (
              <button
                type="button"
                onClick={() => setActiveTab('security')}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap cursor-pointer ${
                  activeTab === 'security'
                    ? 'bg-white text-[#1C1917] shadow-xs'
                    : 'text-[#57534E] hover:text-[#1C1917]'
                }`}
              >
                <ShieldAlert className="h-3.5 w-3.5" />
                <span>سجل الأمان ({unresolvedSecurity.length})</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setActiveTab('changes')}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap cursor-pointer ${
                activeTab === 'changes'
                  ? 'bg-white text-[#1C1917] shadow-xs'
                  : 'text-[#57534E] hover:text-[#1C1917]'
              }`}
            >
              <span>طلبات التعديل والإضافة ({pendingChanges.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('membership')}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap cursor-pointer ${
                activeTab === 'membership'
                  ? 'bg-white text-[#1C1917] shadow-xs'
                  : 'text-[#57534E] hover:text-[#1C1917]'
              }`}
            >
              <span>طلبات الانضمام ({pendingMemberships.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('codes')}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap cursor-pointer ${
                activeTab === 'codes'
                  ? 'bg-white text-[#1C1917] shadow-xs'
                  : 'text-[#57534E] hover:text-[#1C1917]'
              }`}
            >
              <KeyRound className="h-3.5 w-3.5" />
              <span>أكواد الدعوة</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('subscribers')}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap cursor-pointer ${
                activeTab === 'subscribers'
                  ? 'bg-white text-[#1C1917] shadow-xs'
                  : 'text-[#57534E] hover:text-[#1C1917]'
              }`}
            >
              <Users className="h-3.5 w-3.5" />
              <span>المشتركون ({subscribers.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('profiles')}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap cursor-pointer ${
                activeTab === 'profiles'
                  ? 'bg-white text-[#1C1917] shadow-xs'
                  : 'text-[#57534E] hover:text-[#1C1917]'
              }`}
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>الصلاحيات</span>
            </button>
          </div>
        </div>

        {/* 1. تبويب سجل الأمان (للمالك فقط) */}
        {activeTab === 'security' && isOwner && (
          <div className="mt-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-1 rounded-lg bg-[#FAF8F4] p-1 border border-[#E5E0D5]">
                {[
                  { id: 'all', label: 'الكل' },
                  { id: 'unresolved', label: 'غير مغلقة' },
                  { id: 'critical', label: 'حرج' },
                  { id: 'high', label: 'عالي' },
                  { id: 'medium', label: 'متوسط' },
                  { id: 'low', label: 'منخفض' },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setSeverityFilter(opt.id)}
                    className={`rounded-md px-3 py-1 text-xs font-medium cursor-pointer ${
                      severityFilter === opt.id
                        ? 'bg-[#14532D] text-white'
                        : 'text-[#57534E] hover:text-[#1C1917]'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <span className="text-xs text-[#57534E] tabular-nums">
                عرض {filteredSecurityEvents.length} من أصل {securityEvents.length} حدث
              </span>
            </div>

            {filteredSecurityEvents.length === 0 ? (
              <div className="py-12 text-center text-sm text-[#57534E]">
                لا توجد أحداث أمنية مطابقة في جدول security_events.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead className="border-b border-[#E5E0D5] bg-[#FAF8F4] text-[#57534E]">
                    <tr>
                      <th className="px-3 py-3">الخطورة</th>
                      <th className="px-3 py-3">نوع الحدث</th>
                      <th className="px-3 py-3">الملخص الأمني</th>
                      <th className="px-3 py-3">المستخدم / المصدر</th>
                      <th className="px-3 py-3">الوقت</th>
                      <th className="px-3 py-3">الحالة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F2EFE9]">
                    {filteredSecurityEvents.map((ev) => {
                      const isCriticalOrHigh = ev.severity === 'critical' || ev.severity === 'high';
                      return (
                        <tr key={ev.id} className="hover:bg-[#FAF8F4]">
                          <td className="px-3 py-3 font-semibold whitespace-nowrap">
                            <span
                              className={`inline-flex items-center gap-1 ${
                                isCriticalOrHigh
                                  ? 'text-[#B91C1C]'
                                  : ev.severity === 'medium'
                                    ? 'text-[#92400E]'
                                    : 'text-[#14532D]'
                              }`}
                            >
                              {isCriticalOrHigh ? (
                                <AlertTriangle className="h-3.5 w-3.5" />
                              ) : (
                                <ShieldCheck className="h-3.5 w-3.5" />
                              )}
                              <span>{getSeverityLabelArabic(ev.severity)}</span>
                            </span>
                          </td>
                          <td className="px-3 py-3 font-mono text-[#1C1917]">{ev.event_type}</td>
                          <td className="px-3 py-3 max-w-md text-[#1C1917]">
                            <p>{ev.summary}</p>
                            {ev.target_table && (
                              <span className="font-mono text-[11px] text-[#78716C]">
                                الجدول: {ev.target_table}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-3 font-mono text-[#57534E]">
                            {ev.actor_email || ev.actor_id || 'غير مسجل'}
                          </td>
                          <td className="px-3 py-3 font-mono tabular-nums text-[#57534E] whitespace-nowrap">
                            {formatDateArabic(ev.created_at)}
                          </td>
                          <td className="px-3 py-3 whitespace-nowrap">
                            {ev.resolved ? (
                              <span className="text-[#14532D] font-medium">تمت المراجعة</span>
                            ) : (
                              <button
                                type="button"
                                disabled={busyId === ev.id}
                                onClick={() => void handleResolveSecurityEvent(ev.id)}
                                className="rounded border border-[#D6CEBE] bg-white px-2.5 py-1 text-[11px] font-medium text-[#1C1917] hover:bg-[#F2EFE9] cursor-pointer"
                              >
                                {busyId === ev.id ? 'جاري الإغلاق...' : 'إغلاق التنبيه'}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* 2. تبويب طلبات التعديل */}
        {activeTab === 'changes' && (
          <div className="mt-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="inline-flex items-center gap-1 rounded-lg border border-[#E5E0D5] bg-[#FAF8F4] p-1">
                <button
                  type="button"
                  onClick={() => setChangesFilter('pending')}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium cursor-pointer ${
                    changesFilter === 'pending'
                      ? 'bg-[#14532D] text-white'
                      : 'text-[#57534E] hover:text-[#1C1917]'
                  }`}
                >
                  قائمة الانتظار ({pendingChanges.length})
                </button>
                <button
                  type="button"
                  onClick={() => setChangesFilter('history')}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium cursor-pointer ${
                    changesFilter === 'history'
                      ? 'bg-white text-[#1C1917] shadow-xs'
                      : 'text-[#57534E] hover:text-[#1C1917]'
                  }`}
                >
                  السجل المؤرشف ({archivedChanges.length})
                </button>
              </div>
            </div>

            <div className="divide-y divide-[#E5E0D5]">
              {displayedChanges.length === 0 ? (
                <div className="py-12 text-center text-sm text-[#57534E]">
                  {changesFilter === 'pending'
                    ? 'لا توجد طلبات تعديل أو حذف بانتظار المراجعة حالياً.'
                    : 'لا توجد طلبات تعديل مؤرشفة بعد.'}
                </div>
              ) : (
                displayedChanges.map((req) => {
                  const targetId = req.target_person_id || req.person_id;
                  const target = targetId ? peopleMap.get(targetId) : null;
                  const proposed = req.proposed_data || {};
                  const isPending = req.status === 'pending';
                  const isDeleteRequest = req.request_type === 'delete';
                  const isAddRequest =
                    req.request_type === 'add' ||
                    req.request_type === 'create' ||
                    (!isDeleteRequest && !targetId);

                  return (
                    <div
                      key={req.id}
                      className={`py-5 ${isDeleteRequest ? 'rounded-lg bg-[#FEF2F2]/40 px-4 my-2 border border-[#FCA5A5]/60' : ''}`}
                    >
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2 text-xs text-[#57534E]">
                            {isDeleteRequest ? (
                              <span className="inline-flex items-center gap-1 rounded border border-[#FCA5A5] bg-[#FEF2F2] px-2.5 py-0.5 text-[11px] font-bold text-[#B91C1C]">
                                <Trash2 className="h-3 w-3" />
                                <span>طلب حذف</span>
                              </span>
                            ) : isAddRequest ? (
                              <span className="inline-flex items-center gap-1 rounded border border-[#86EFAC] bg-[#DCFCE7] px-2.5 py-0.5 text-[11px] font-bold text-[#166534]">
                                <Plus className="h-3 w-3" />
                                <span>طلب إضافة</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded border border-[#93C5FD] bg-[#EFF6FF] px-2.5 py-0.5 text-[11px] font-bold text-[#1D4ED8]">
                                <Edit3 className="h-3 w-3" />
                                <span>طلب تعديل</span>
                              </span>
                            )}
                            <span>·</span>
                            <span>مقدم الطلب: {req.requester_name || req.requested_by}</span>
                            <span>·</span>
                            <span className="font-mono tabular-nums">
                              {formatDateArabic(req.created_at)}
                            </span>
                            <span>·</span>
                            <span
                              className={`font-semibold ${
                                req.status === 'approved'
                                  ? 'text-[#166534]'
                                  : req.status === 'rejected' || req.status === 'blocked'
                                    ? 'text-[#B91C1C]'
                                    : 'text-[#92400E]'
                              }`}
                            >
                              {getStatusLabelArabic(req.status)}
                            </span>
                          </div>

                          <h3 className="mt-1.5 text-base font-bold text-[#1C1917]">
                            {isDeleteRequest
                              ? `حذف الفرد: ${target?.full_name || String(proposed.full_name || 'غير معروف')}`
                              : isAddRequest
                                ? `إضافة فرد جديد: ${String(proposed.full_name || 'غير معروف')}`
                                : target
                                  ? `${target.full_name} ← ${String(proposed.full_name || target.full_name)}`
                                  : String(proposed.full_name || 'تعديل بيانات')}
                          </h3>

                          {req.reason && (
                            <p
                              className={`mt-1 text-xs ${
                                isDeleteRequest ? 'font-medium text-[#991B1B]' : 'text-[#57534E]'
                              }`}
                            >
                              {isDeleteRequest ? 'سبب الحذف: ' : 'سبب الطلب: '}
                              {req.reason}
                            </p>
                          )}
                          {req.security_notes && (
                            <p className="mt-1 text-xs text-[#14532D]">
                              ملاحظات المراجعة: {req.security_notes}
                            </p>
                          )}
                        </div>

                        {isPending && (
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              disabled={busyId === req.id}
                              onClick={() => void handleApproveChange(req)}
                              className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-medium text-white disabled:opacity-50 cursor-pointer ${
                                isDeleteRequest
                                  ? 'bg-[#B91C1C] hover:bg-[#991B1B]'
                                  : 'bg-[#14532D] hover:bg-[#166534]'
                              }`}
                            >
                              {busyId === req.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : isDeleteRequest ? (
                                <Trash2 className="h-3.5 w-3.5" />
                              ) : (
                                <Check className="h-3.5 w-3.5" />
                              )}
                              <span>موافقة وتنفيذ</span>
                            </button>
                            <button
                              type="button"
                              disabled={busyId === req.id}
                              onClick={() => void handleRejectChange(req)}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-[#D6CEBE] bg-white px-3.5 py-2 text-xs font-medium text-[#B91C1C] hover:bg-[#FEF2F2] disabled:opacity-50 cursor-pointer"
                            >
                              <X className="h-3.5 w-3.5" />
                              <span>رفض</span>
                            </button>
                          </div>
                        )}
                      </div>

                      {!isDeleteRequest && (() => {
                        const proposedName = String(proposed.full_name || '').trim();
                        const proposedTribe = String(
                          proposed.tribe_title ?? proposed.branch_name ?? ''
                        ).trim();
                        const proposedBirth = String(
                          proposed.birth_date ?? proposed.birth_year ?? ''
                        ).trim();
                        const proposedAlive = proposed.is_alive !== false;
                        const proposedDeath = !proposedAlive
                          ? String(proposed.death_date ?? proposed.death_year ?? '').trim()
                          : '';
                        const proposedLocation = String(proposed.location || '').trim();
                        const proposedFather =
                          typeof proposed.father_id === 'string' && proposed.father_id
                            ? peopleMap.get(proposed.father_id)?.full_name || 'محدد'
                            : 'بدون أب (جد مؤسس)';

                        if (isAddRequest || !target) {
                          return (
                            <div className="mt-3 grid grid-cols-2 gap-3 rounded-lg border border-[#E5E0D5] bg-[#FAF8F4] p-3.5 text-xs sm:grid-cols-3 lg:grid-cols-6">
                              <div>
                                <span className="text-[#78716C]">الاسم الكامل:</span>
                                <div className="mt-0.5 font-semibold text-[#1C1917]">
                                  {proposedName || '—'}
                                </div>
                              </div>
                              <div>
                                <span className="text-[#78716C]">اللقب / القبيلة أو الفخذ:</span>
                                <div className="mt-0.5 font-medium text-[#1C1917]">
                                  {proposedTribe || '—'}
                                </div>
                              </div>
                              <div>
                                <span className="text-[#78716C]">تاريخ / سنة الميلاد:</span>
                                <div className="mt-0.5 font-mono tabular-nums font-medium text-[#1C1917]">
                                  {proposedBirth || '—'}
                                </div>
                              </div>
                              <div>
                                <span className="text-[#78716C]">حالة الحياة:</span>
                                <div className="mt-0.5 font-semibold">
                                  {proposedAlive ? (
                                    <span className="text-[#166534]">على قيد الحياة</span>
                                  ) : (
                                    <span className="text-[#991B1B]">
                                      متوفى {proposedDeath ? `(${proposedDeath})` : ''}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div>
                                <span className="text-[#78716C]">الأب / الجيل:</span>
                                <div className="mt-0.5 font-medium text-[#1C1917]">
                                  {proposedFather} · ج{String(proposed.generation || '1')}
                                </div>
                              </div>
                              <div>
                                <span className="text-[#78716C]">الإقامة:</span>
                                <div className="mt-0.5 font-medium text-[#1C1917]">
                                  {proposedLocation || '—'}
                                </div>
                              </div>
                            </div>
                          );
                        }

                        const curName = (target.full_name || '').trim();
                        const curTribe = getPersonTribeTitle(target);
                        const curBirth = getPersonBirthDisplay(target);
                        const curAlive = target.is_alive !== false;
                        const curDeath = getPersonDeathDisplay(target);

                        const nameChanged = Boolean(proposedName && proposedName !== curName);
                        const tribeChanged = proposedTribe !== curTribe;
                        const birthChanged = proposedBirth !== curBirth;
                        const aliveChanged = proposedAlive !== curAlive;
                        const deathChanged =
                          (!proposedAlive || !curAlive) && proposedDeath !== curDeath;
                        const isRecordingDeath = curAlive && !proposedAlive;

                        const comparisonRows = [
                          {
                            label: 'الاسم الكامل',
                            current: curName || '—',
                            next: proposedName || '—',
                            changed: nameChanged,
                            badge: nameChanged ? 'الاسم الجديد' : null,
                          },
                          {
                            label: 'اللقب / القبيلة أو الفخذ',
                            current: curTribe || '—',
                            next: proposedTribe || '—',
                            changed: tribeChanged,
                            badge: tribeChanged ? 'تحديث اللقب' : null,
                          },
                          {
                            label: 'تاريخ أو سنة الميلاد',
                            current: curBirth || '—',
                            next: proposedBirth || '—',
                            changed: birthChanged,
                            badge: birthChanged ? 'تعديل المواليد' : null,
                          },
                          {
                            label: 'حالة الحياة',
                            current: curAlive ? 'على قيد الحياة' : 'متوفى',
                            next: proposedAlive ? 'على قيد الحياة' : 'متوفى',
                            changed: aliveChanged,
                            badge: isRecordingDeath
                              ? 'تسجيل وفاة'
                              : aliveChanged
                                ? 'تغيير الحالة'
                                : null,
                          },
                          ...(!proposedAlive || !curAlive || deathChanged
                            ? [
                                {
                                  label: 'تاريخ أو سنة الوفاة',
                                  current: curDeath || '—',
                                  next: proposedDeath || '—',
                                  changed: deathChanged || isRecordingDeath,
                                  badge:
                                    isRecordingDeath || deathChanged ? 'تاريخ الوفاة' : null,
                                },
                              ]
                            : []),
                        ];

                        return (
                          <div className="mt-3 overflow-hidden rounded-lg border border-[#E5E0D5] bg-[#FAF8F4]">
                            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E5E0D5] bg-[#F2EFE9]/70 px-3.5 py-2 text-[11px] font-semibold text-[#57534E]">
                              <span>مقارنة البيانات (الحالي ← التعديل المطلوب من المشترك)</span>
                              <span className="font-mono tabular-nums">
                                الجيل {String(proposed.generation || target.generation || '—')}
                              </span>
                            </div>
                            <div className="divide-y divide-[#E5E0D5]/70 text-xs">
                              {comparisonRows.map((row) => (
                                <div
                                  key={row.label}
                                  className={`grid grid-cols-1 gap-1.5 px-3.5 py-2.5 sm:grid-cols-12 sm:items-center ${
                                    row.changed ? 'bg-[#FFFBEB]/85' : 'bg-white/60'
                                  }`}
                                >
                                  <div className="flex items-center gap-2 font-medium text-[#57534E] sm:col-span-4">
                                    <span>{row.label}</span>
                                    {row.badge && (
                                      <span
                                        className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                                          row.badge === 'تسجيل وفاة'
                                            ? 'bg-[#FEF2F2] text-[#B91C1C] border border-[#FCA5A5]'
                                            : 'bg-[#FEF3C7] text-[#92400E] border border-[#FCD34D]'
                                        }`}
                                      >
                                        {row.badge}
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[#78716C] sm:col-span-4">
                                    <span className="ml-1 text-[10px] text-[#A8A29E]">الحالي:</span>
                                    <span className={row.changed ? 'line-through' : ''}>
                                      {row.current}
                                    </span>
                                  </div>
                                  <div className="font-semibold sm:col-span-4">
                                    <span className="ml-1 text-[10px] font-normal text-[#78716C]">
                                      الجديد:
                                    </span>
                                    <span
                                      className={
                                        row.changed ? 'text-[#14532D]' : 'text-[#1C1917]'
                                      }
                                    >
                                      {row.next}
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* 3. تبويب طلبات الانضمام */}
        {activeTab === 'membership' && (
          <div className="mt-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="inline-flex items-center gap-1 rounded-lg border border-[#E5E0D5] bg-[#FAF8F4] p-1">
                <button
                  type="button"
                  onClick={() => setMembershipFilter('pending')}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium cursor-pointer ${
                    membershipFilter === 'pending'
                      ? 'bg-[#14532D] text-white'
                      : 'text-[#57534E] hover:text-[#1C1917]'
                  }`}
                >
                  قائمة الانتظار ({pendingMemberships.length})
                </button>
                <button
                  type="button"
                  onClick={() => setMembershipFilter('history')}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium cursor-pointer ${
                    membershipFilter === 'history'
                      ? 'bg-white text-[#1C1917] shadow-xs'
                      : 'text-[#57534E] hover:text-[#1C1917]'
                  }`}
                >
                  السجل المؤرشف ({archivedMemberships.length})
                </button>
              </div>
            </div>

            <div className="divide-y divide-[#E5E0D5]">
              {displayedMemberships.length === 0 ? (
                <div className="py-12 text-center text-sm text-[#57534E]">
                  {membershipFilter === 'pending'
                    ? 'لا توجد طلبات انضمام جديدة بانتظار المراجعة حالياً.'
                    : 'لا توجد طلبات انضمام مؤرشفة بعد.'}
                </div>
              ) : (
                displayedMemberships.map((req) => (
                  <div
                    key={req.id}
                    className="flex flex-col gap-3 py-4 md:flex-row md:items-center md:justify-between"
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-[#57534E]">
                        <span className="font-semibold text-[#1C1917] text-sm">{req.full_name}</span>
                        <span>·</span>
                        <span className="font-mono">{req.email}</span>
                        {req.phone && (
                          <>
                            <span>·</span>
                            <span className="font-mono tabular-nums" dir="ltr">
                              {req.phone}
                            </span>
                          </>
                        )}
                        <span>·</span>
                        <span
                          className={`font-semibold ${
                            req.status === 'approved'
                              ? 'text-[#166534]'
                              : req.status === 'rejected' || req.status === 'blocked'
                                ? 'text-[#B91C1C]'
                                : 'text-[#92400E]'
                          }`}
                        >
                          {getStatusLabelArabic(req.status)}
                        </span>
                      </div>
                      {req.lineage_note && (
                        <p className="mt-1 text-xs text-[#1C1917]">
                          صلة القرابة المذكورة: {req.lineage_note}
                        </p>
                      )}
                      <div className="mt-1 flex flex-wrap gap-3 text-[11px] text-[#78716C]">
                        <span>الفحص الأمني: {req.security_notes || req.security_status || 'تم الفحص'}</span>
                        {req.invitation_code_used && (
                          <span className="font-mono text-[#14532D]">
                            كود الدعوة: {req.invitation_code_used}
                          </span>
                        )}
                      </div>
                    </div>

                    {req.status === 'pending' && (
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          disabled={busyId === req.id}
                          onClick={() => void handleApproveMembership(req)}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-[#14532D] px-3.5 py-2 text-xs font-medium text-white hover:bg-[#166534] disabled:opacity-50 cursor-pointer"
                        >
                          {busyId === req.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <UserCheck className="h-3.5 w-3.5" />
                          )}
                          <span>قبول وتوليد كود</span>
                        </button>
                        <button
                          type="button"
                          disabled={busyId === req.id}
                          onClick={() => void handleRejectMembership(req)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-[#D6CEBE] bg-white px-3.5 py-2 text-xs font-medium text-[#B91C1C] hover:bg-[#FEF2F2] disabled:opacity-50 cursor-pointer"
                        >
                          <X className="h-3.5 w-3.5" />
                          <span>رفض</span>
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* 4. تبويب أكواد الدعوة */}
        {activeTab === 'codes' && (
          <div className="mt-5">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#E5E0D5] bg-[#FAF8F4] p-4">
              <div>
                <h3 className="text-sm font-semibold text-[#1C1917]">إنشاء كود دعوة جديد</h3>
                <p className="text-xs text-[#57534E]">
                  يُستخدم الكود لمرة واحدة عند تسجيل عضو جديد ويمنحه الصلاحية المحددة.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={newCodeRole}
                  onChange={(e) => setNewCodeRole(e.target.value as UserRole)}
                  className="rounded-lg border border-[#D6CEBE] bg-white px-3 py-2 text-xs text-[#1C1917] focus:border-[#14532D] focus:outline-none"
                >
                  <option value="subscriber">صلاحية مشترك (تصفح وتقديم طلبات)</option>
                  {isOwner && <option value="admin">صلاحية مشرف (إدارة الشجرة)</option>}
                </select>
                <button
                  type="button"
                  disabled={busyId === 'new-code'}
                  onClick={() => void handleGenerateCode()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#14532D] px-4 py-2 text-xs font-medium text-white hover:bg-[#166534] whitespace-nowrap cursor-pointer"
                >
                  {busyId === 'new-code' ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <KeyRound className="h-3.5 w-3.5" />
                  )}
                  <span>توليد كود</span>
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="border-b border-[#E5E0D5] bg-[#FAF8F4] text-[#57534E]">
                  <tr>
                    <th className="px-3 py-3">الكود</th>
                    <th className="px-3 py-3">الصلاحية الممنوحة</th>
                    <th className="px-3 py-3">الحالة</th>
                    <th className="px-3 py-3">تاريخ الإنشاء</th>
                    <th className="px-3 py-3">نسخ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F2EFE9]">
                  {invitationCodes.map((code) => (
                    <tr key={code.id} className="hover:bg-[#FAF8F4]">
                      <td className="px-3 py-3 font-mono font-semibold text-[#1C1917]">
                        {code.code}
                      </td>
                      <td className="px-3 py-3 text-[#57534E]">
                        {getRoleLabelArabic(code.role)}
                      </td>
                      <td className="px-3 py-3">
                        <span className={code.is_used ? 'text-[#78716C]' : 'font-semibold text-[#14532D]'}>
                          {code.is_used ? 'مستخدم' : 'متاح للاستخدام'}
                        </span>
                      </td>
                      <td className="px-3 py-3 font-mono tabular-nums text-[#57534E]">
                        {formatDateArabic(code.created_at)}
                      </td>
                      <td className="px-3 py-3">
                        <button
                          type="button"
                          onClick={() => void handleCopyCode(code.code)}
                          className="inline-flex items-center gap-1 text-[#14532D] hover:underline cursor-pointer"
                        >
                          {copiedCode === code.code ? (
                            <Check className="h-3.5 w-3.5" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                          <span>{copiedCode === code.code ? 'تم النسخ' : 'نسخ'}</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 5. تبويب المشتركين */}
        {activeTab === 'subscribers' && (
          <div className="mt-5">
            <div className="mb-4 flex flex-col gap-3 rounded-lg border border-[#E5E0D5] bg-[#FAF8F4] p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-sm font-semibold text-[#1C1917]">
                  سجل المشتركين والأعضاء المسجلين ({subscribers.length})
                </h3>
                <p className="mt-0.5 text-xs text-[#57534E]">
                  {isAdminRole
                    ? 'استعراض قائمة الأعضاء المسجلين ورتبهم الحالية (عرض للقراءة فقط).'
                    : isDeveloperRole
                      ? 'إدارة المشرفين والمشتركين ضمن صلاحيات المطور (حسابات المالك والمطورين محمية).'
                      : 'قائمة شاملة من الحسابات النشطة وطلبات الانضمام المعتمدة مع إمكانية تعديل الرتبة أو إيقاف الحساب.'}
                </p>
              </div>
              <div className="relative w-full sm:w-80">
                <Search
                  className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#78716C]"
                  aria-hidden="true"
                />
                <input
                  type="text"
                  value={subscriberSearch}
                  onChange={(e) => setSubscriberSearch(e.target.value)}
                  placeholder="بحث بالاسم، الكنية، البريد، أو الهاتف..."
                  className="w-full rounded-lg border border-[#D6CEBE] bg-white py-2 pr-9 pl-8 text-xs text-[#1C1917] placeholder:text-[#78716C] focus:border-[#14532D] focus:outline-none"
                />
                {subscriberSearch && (
                  <button
                    type="button"
                    onClick={() => setSubscriberSearch('')}
                    aria-label="مسح البحث"
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#78716C] hover:text-[#1C1917] cursor-pointer"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>

            {filteredSubscribers.length === 0 ? (
              <div className="py-12 text-center text-sm text-[#57534E]">
                لا توجد نتائج مطابقة لبحثك في قائمة المشتركين.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead className="border-b border-[#E5E0D5] bg-[#FAF8F4] text-[#57534E]">
                    <tr>
                      <th className="px-3 py-3">الاسم الكامل</th>
                      <th className="px-3 py-3">الكنية</th>
                      <th className="px-3 py-3">البريد الإلكتروني</th>
                      <th className="px-3 py-3">رقم الهاتف</th>
                      <th className="px-3 py-3">الرتبة الحالية</th>
                      <th className="px-3 py-3">تاريخ الانضمام</th>
                      {!isAdminRole && <th className="px-3 py-3">إدارة الرتبة</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F2EFE9]">
                    {filteredSubscribers.map((sub) => {
                      const isSelf = sub.profileId === profile.id;
                      const effectiveRole = normalizeUserRole(
                        sub.is_suspended ? 'suspended' : sub.role
                      );

                      return (
                        <tr
                          key={sub.key}
                          className={`hover:bg-[#FAF8F4] ${sub.is_suspended ? 'bg-[#FEF2F2]/40' : ''}`}
                        >
                          <td className="px-3 py-3">
                            <div className="flex items-center gap-2.5">
                              <div className="h-8 w-8 shrink-0 overflow-hidden rounded-lg border border-[#E5E0D5] bg-[#FAF8F4] flex items-center justify-center">
                                {sub.avatar_url ? (
                                  <img
                                    src={sub.avatar_url}
                                    alt={sub.full_name}
                                    loading="lazy"
                                    decoding="async"
                                    className="h-full w-full object-cover"
                                  />
                                ) : (
                                  <User className="h-4 w-4 text-[#78716C]" />
                                )}
                              </div>
                              <div>
                                <span className="font-semibold text-[#1C1917]">{sub.full_name}</span>
                                {sub.is_suspended && (
                                  <span className="mr-1.5 inline-block rounded border border-[#FCA5A5] bg-[#FEF2F2] px-1.5 py-0.5 text-[10px] font-bold text-[#B91C1C]">
                                    موقوف
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-3 text-[#92400E] font-medium">
                            {sub.nickname || '—'}
                          </td>
                          <td className="px-3 py-3 font-mono text-[#57534E]">
                            {sub.email || '—'}
                          </td>
                          <td className="px-3 py-3 font-mono tabular-nums text-[#57534E]">
                            <span dir="ltr">{sub.phone || '—'}</span>
                          </td>
                          <td className="px-3 py-3 whitespace-nowrap">
                            {isAdminRole ? (
                              <span className="font-medium text-[#1C1917]">
                                {getRoleLabelArabic(effectiveRole)}
                              </span>
                            ) : (
                              <span
                                className={`inline-flex rounded border px-2 py-0.5 text-[11px] font-semibold ${getRoleBadgeClasses(
                                  effectiveRole
                                )}`}
                              >
                                {getRoleLabelArabic(effectiveRole)}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-3 font-mono tabular-nums text-[#57534E] whitespace-nowrap">
                            {formatDateArabic(sub.joined_at)}
                          </td>
                          {!isAdminRole && (
                            <td className="px-3 py-3 whitespace-nowrap">
                              {renderRoleManagementCell(
                                sub.linkedProfile,
                                effectiveRole,
                                sub.full_name,
                                isSelf
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* 6. تبويب الصلاحيات */}
        {activeTab === 'profiles' && (
          <div className="mt-5">
            <div className="mb-4 rounded-lg border border-[#E5E0D5] bg-[#FAF8F4] px-4 py-3 text-xs text-[#57534E]">
              {isAdminRole
                ? 'استعراض رتب وصلاحيات الحسابات المسجلة (للقراءة فقط — لا يملك المشرف صلاحية تعديل الرتب).'
                : isDeveloperRole
                  ? 'صلاحيات المطور: يمكنك إدارة رتب المشرفين والمشتركين وإيقاف الحسابات، بينما تبقى حسابات المالك والمطورين محمية.'
                  : 'صلاحيات المالك: يمكنك ترقية أو تخفيض رتبة أي عضو أو إيقاف حسابه (ما عدا حساب المالك الحالي).'}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="border-b border-[#E5E0D5] bg-[#FAF8F4] text-[#57534E]">
                  <tr>
                    <th className="px-3 py-3">الاسم</th>
                    <th className="px-3 py-3">رقم الموبايل</th>
                    <th className="px-3 py-3">الصلاحية الحالية</th>
                    {!isAdminRole && <th className="px-3 py-3">تغيير الصلاحية</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F2EFE9]">
                  {allProfiles.map((p) => {
                    const isSelf = p.id === profile.id;
                    const effectiveRole = normalizeUserRole(
                      p.is_suspended ? 'suspended' : p.role
                    );
                    return (
                      <tr key={p.id} className="hover:bg-[#FAF8F4]">
                        <td className="px-3 py-3 font-semibold text-[#1C1917]">{p.full_name}</td>
                        <td className="px-3 py-3 font-mono tabular-nums text-[#57534E]">
                          <span dir="ltr">{p.phone || '—'}</span>
                        </td>
                        <td className="px-3 py-3 font-medium">
                          {isAdminRole ? (
                            <span className="font-medium text-[#1C1917]">
                              {getRoleLabelArabic(effectiveRole)}
                            </span>
                          ) : (
                            <span
                              className={`inline-flex rounded border px-2 py-0.5 text-[11px] font-semibold ${getRoleBadgeClasses(
                                effectiveRole
                              )}`}
                            >
                              {getRoleLabelArabic(effectiveRole)}
                            </span>
                          )}
                        </td>
                        {!isAdminRole && (
                          <td className="px-3 py-3 whitespace-nowrap">
                            {renderRoleManagementCell(p, effectiveRole, p.full_name, isSelf)}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
