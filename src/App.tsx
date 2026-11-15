import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Compass, X } from 'lucide-react';
import { AccountSettingsView } from './components/AccountSettingsView';
import { AuthScreen } from './components/AuthScreen';
import { ChangeRequestModal, type EditModalMode } from './components/ChangeRequestModal';
import { DeletePersonModal } from './components/DeletePersonModal';
import { ErrorBoundary } from './components/ErrorBoundary';
import { FamilyTreeView } from './components/FamilyTreeView';
import { Header, type ActiveTab } from './components/Header';
import { KinshipCalculator } from './components/KinshipCalculator';
import { KinshipRadarModal } from './components/KinshipRadarModal';
import { MemberDossierModal } from './components/MemberDossierModal';
import { MyRequestsView } from './components/MyRequestsView';
import { OwnerDashboard } from './components/OwnerDashboard';
import { ResetPasswordModal } from './components/ResetPasswordModal';
import { SmartSearchBar } from './components/SmartSearchBar';
import { getSupabaseErrorMessage, isSupabaseConfigured, supabase } from './lib/supabase';
import type {
  ChangeRequest,
  FamilyPerson,
  InvitationCode,
  MembershipRequest,
  Profile,
  SecurityEvent,
} from './types/database';
import {
  canEditOrDeletePerson,
  isPrivilegedRole,
  type KinshipRadarHighlight,
} from './utils/kinship';
import { downloadLineageShareCard } from './utils/lineageCardImage';
import { fetchFamilyPeopleForTree } from './utils/familyPersonDb';
import {
  clearCachedFamilyPeople,
  loadCachedFamilyPeople,
  saveCachedFamilyPeople,
  toLightweightFamilyPerson,
} from './utils/treeCache';

export default function App() {
  const [authLoading, setAuthLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('tree');

  // بيانات الشجرة والإدارة (مع التهيئة الفورية من الذاكرة المؤقتة للمتصفح)
  const [people, setPeople] = useState<FamilyPerson[]>(() => loadCachedFamilyPeople());
  const [peopleLoading, setPeopleLoading] = useState(false);
  const [changeRequests, setChangeRequests] = useState<ChangeRequest[]>([]);
  const [membershipRequests, setMembershipRequests] = useState<MembershipRequest[]>([]);
  const [invitationCodes, setInvitationCodes] = useState<InvitationCode[]>([]);
  const [securityEvents, setSecurityEvents] = useState<SecurityEvent[]>([]);
  const [allProfiles, setAllProfiles] = useState<Profile[]>([]);

  // حالات التفاعل والبحث والنوافذ
  const [searchQuery, setSearchQuery] = useState('');
  const [searchMatchedIds, setSearchMatchedIds] = useState<string[]>([]);
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [highlightedPersonId, setHighlightedPersonId] = useState<string | null>(null);
  const [focusRequest, setFocusRequest] = useState<{ personId: string; seq: number } | null>(null);
  const [editModalState, setEditModalState] = useState<{
    isOpen: boolean;
    mode: EditModalMode;
    targetPerson: FamilyPerson | null;
    defaultFather: FamilyPerson | null;
  }>({
    isOpen: false,
    mode: 'request-update',
    targetPerson: null,
    defaultFather: null,
  });
  const [deleteTargetPerson, setDeleteTargetPerson] = useState<FamilyPerson | null>(null);
  const [isRadarOpen, setIsRadarOpen] = useState(false);
  const [radarInitialTargetB, setRadarInitialTargetB] = useState<string | null>(null);
  const [kinshipRadarHighlight, setKinshipRadarHighlight] = useState<KinshipRadarHighlight | null>(
    null
  );

  const [toast, setToast] = useState<{ message: string; isError?: boolean } | null>(null);
  const holdAuthRedirectRef = useRef(false);
  const [isPasswordResetOpen, setIsPasswordResetOpen] = useState<boolean>(() => {
    const queryParams = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    return (
      queryParams.get('type') === 'recovery' ||
      hashParams.get('type') === 'recovery'
    );
  });

  const peopleCountRef = useRef(people.length);
  peopleCountRef.current = people.length;

  const updatePeopleAndCache = useCallback(
    (updater: FamilyPerson[] | ((prev: FamilyPerson[]) => FamilyPerson[])) => {
      setPeople((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : updater;
        saveCachedFamilyPeople(next);
        return next;
      });
    },
    []
  );

  const showNotify = useCallback((message: string, isError = false) => {
    setToast({ message, isError });
    setTimeout(() => {
      setToast((prev) => (prev?.message === message ? null : prev));
    }, isError ? 8500 : 5000);
  }, []);

  const loadWorkspaceData = useCallback(
    async (currentProfile: Profile) => {
      if (!supabase) return;
      if (peopleCountRef.current === 0) {
        setPeopleLoading(true);
      }
      try {
        const { data: peopleData, error: peopleErr } = await fetchFamilyPeopleForTree();

        if (peopleErr) {
          showNotify('تعذر جلب بيانات شجرة العائلة: ' + peopleErr.message, true);
        } else {
          updatePeopleAndCache(peopleData || []);
        }

      const isManager = isPrivilegedRole(currentProfile.role);

      const { data: profListRes, error: profListErr } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });
      if (!profListErr && profListRes) {
        setAllProfiles(profListRes as Profile[]);
      } else {
        setAllProfiles([currentProfile]);
      }

      if (isManager) {
        const [reqRes, memRes, codeRes] = await Promise.all([
          supabase.from('change_requests').select('*').order('created_at', { ascending: false }),
          supabase.from('membership_requests').select('*').order('created_at', { ascending: false }),
          supabase.from('invitation_codes').select('*').order('created_at', { ascending: false }),
        ]);

        if (!reqRes.error) setChangeRequests((reqRes.data as ChangeRequest[]) || []);
        if (!memRes.error) setMembershipRequests((memRes.data as MembershipRequest[]) || []);
        if (!codeRes.error) {
          setInvitationCodes((codeRes.data as InvitationCode[]) || []);
        } else {
          const fallbackCodes = await supabase.from('invitation_codes').select('*');
          if (!fallbackCodes.error) {
            setInvitationCodes((fallbackCodes.data as InvitationCode[]) || []);
          }
        }

        if (currentProfile.role === 'owner' || currentProfile.role === 'developer') {
          const secRes = await supabase
            .from('security_events')
            .select('*')
            .order('created_at', { ascending: false });
          if (!secRes.error) setSecurityEvents((secRes.data as SecurityEvent[]) || []);
        }
      } else {
        const { data: myReqs } = await supabase
          .from('change_requests')
          .select('*')
          .eq('requested_by', currentProfile.id)
          .order('created_at', { ascending: false });
        setChangeRequests((myReqs as ChangeRequest[]) || []);
      }
    } catch (err) {
      showNotify(
        getSupabaseErrorMessage(err, 'حدث خطأ أثناء تحميل بيانات الشجرة من Supabase.'),
        true
      );
    } finally {
      setPeopleLoading(false);
    }
  }, [showNotify, updatePeopleAndCache]);

  const loadCurrentSession = useCallback(async () => {
    if (!supabase || !isSupabaseConfigured) {
      setAuthLoading(false);
      return;
    }

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user) {
        setProfile(null);
        setPeople([]);
        clearCachedFamilyPeople();
        setAuthLoading(false);
        return;
      }

      const { data: profData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .maybeSingle<Profile>();

      const resolvedProfile: Profile = profData ?? {
        id: session.user.id,
        full_name:
          (session.user.user_metadata?.full_name as string) ||
          session.user.email?.split('@')[0] ||
          'عضو العائلة',
        email: session.user.email ?? null,
        role: (session.user.user_metadata?.role as Profile['role']) || 'subscriber',
      };

      if (resolvedProfile.is_suspended === true || resolvedProfile.role === 'suspended') {
        await supabase.auth.signOut();
        setProfile(null);
        setPeople([]);
        clearCachedFamilyPeople();
        showNotify('تم إيقاف هذا الحساب من قبل إدارة العائلة. يرجى التواصل مع المالك.', true);
        return;
      }

      setProfile(resolvedProfile);
      // عرض الشجرة المخزنة مؤقتاً فوراً ثم تحديث البيانات في الخلفية
      if (peopleCountRef.current > 0) {
        setAuthLoading(false);
      }
      await loadWorkspaceData(resolvedProfile);
    } catch (err) {
      showNotify(
        getSupabaseErrorMessage(err, 'تعذر التحقق من جلسة Supabase. تحقق من إعدادات الاتصال.'),
        true
      );
    } finally {
      setAuthLoading(false);
    }
  }, [loadWorkspaceData, showNotify]);

  useEffect(() => {
    void loadCurrentSession();

    if (!supabase) return;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setIsPasswordResetOpen(true);
      }

      if (!session) {
        setProfile(null);
        setPeople([]);
        clearCachedFamilyPeople();
      } else if (!holdAuthRedirectRef.current) {
        void loadCurrentSession();
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [loadCurrentSession]);

  // اشتراك مباشر لتحديث بيانات الشجرة والذاكرة المؤقتة في الخلفية عند أي إضافة أو تعديل
  useEffect(() => {
    if (!supabase || !profile) return;

    const client = supabase;
    const channel = client
      .channel(`tree-realtime-${profile.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'family_people' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const incoming = toLightweightFamilyPerson(payload.new as FamilyPerson);
            updatePeopleAndCache((prev) =>
              prev.some((p) => p.id === incoming.id) ? prev : [...prev, incoming]
            );
          } else if (payload.eventType === 'UPDATE') {
            const updated = toLightweightFamilyPerson(payload.new as FamilyPerson);
            updatePeopleAndCache((prev) =>
              prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p))
            );
          } else if (payload.eventType === 'DELETE') {
            const deletedId = (payload.old as { id?: string })?.id;
            if (deletedId) {
              updatePeopleAndCache((prev) => prev.filter((p) => p.id !== deletedId));
            }
          }
        }
      )
      .subscribe();

    return () => {
      void client.removeChannel(channel);
    };
  }, [profile, updatePeopleAndCache]);

  // اشتراك مباشر (Supabase Realtime) لتحديث طلبات الانضمام والتعديل والمشتركين تلقائياً
  useEffect(() => {
    if (!supabase || !profile || !isPrivilegedRole(profile.role)) return;

    const client = supabase;
    const channel = client
      .channel(`admin-realtime-${profile.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'membership_requests' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const incoming = payload.new as MembershipRequest;
            setMembershipRequests((prev) =>
              prev.some((item) => item.id === incoming.id) ? prev : [incoming, ...prev]
            );
            if (incoming.status === 'pending') {
              showNotify(`وصل طلب انضمام جديد من: ${incoming.full_name}`);
            }
          } else if (payload.eventType === 'UPDATE') {
            const updated = payload.new as MembershipRequest;
            setMembershipRequests((prev) =>
              prev.map((item) => (item.id === updated.id ? updated : item))
            );
          } else if (payload.eventType === 'DELETE') {
            const deletedId = (payload.old as { id?: string })?.id;
            if (deletedId) {
              setMembershipRequests((prev) => prev.filter((item) => item.id !== deletedId));
            }
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'change_requests' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const incoming = payload.new as ChangeRequest;
            setChangeRequests((prev) =>
              prev.some((item) => item.id === incoming.id) ? prev : [incoming, ...prev]
            );
            if (incoming.status === 'pending') {
              showNotify('وصل طلب تعديل أو حذف جديد في الشجرة.');
            }
          } else if (payload.eventType === 'UPDATE') {
            const updated = payload.new as ChangeRequest;
            setChangeRequests((prev) =>
              prev.map((item) => (item.id === updated.id ? updated : item))
            );
          } else if (payload.eventType === 'DELETE') {
            const deletedId = (payload.old as { id?: string })?.id;
            if (deletedId) {
              setChangeRequests((prev) => prev.filter((item) => item.id !== deletedId));
            }
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles' },
        (payload) => {
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const saved = payload.new as Profile;
            setAllProfiles((prev) => {
              const exists = prev.some((p) => p.id === saved.id);
              return exists
                ? prev.map((p) => (p.id === saved.id ? saved : p))
                : [saved, ...prev];
            });
          } else if (payload.eventType === 'DELETE') {
            const deletedId = (payload.old as { id?: string })?.id;
            if (deletedId) {
              setAllProfiles((prev) => prev.filter((p) => p.id !== deletedId));
            }
          }
        }
      )
      .subscribe();

    return () => {
      void client.removeChannel(channel);
    };
  }, [profile, showNotify]);

  async function handleSignOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setProfile(null);
    setPeople([]);
    clearCachedFamilyPeople();
    setSelectedPersonId(null);
    setHighlightedPersonId(null);
    setFocusRequest(null);
    setSearchMatchedIds([]);
    setActiveTab('tree');
  }

  const selectedPerson = useMemo(
    () => people.find((p) => p.id === selectedPersonId) ?? null,
    [people, selectedPersonId]
  );

  const pendingManagerCount = useMemo(() => {
    if (!profile || !isPrivilegedRole(profile.role)) return 0;
    const pendingReq = changeRequests.filter((r) => r.status === 'pending').length;
    const pendingMem = membershipRequests.filter((r) => r.status === 'pending').length;
    const openSec =
      profile.role === 'owner' || profile.role === 'developer'
        ? securityEvents.filter((e) => !e.resolved).length
        : 0;
    return pendingReq + pendingMem + openSec;
  }, [profile, changeRequests, membershipRequests, securityEvents]);

  return (
    <div className="min-h-screen bg-[#FAF8F4] text-[#1C1917] flex flex-col">
      <Header
        profile={profile}
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onSignOut={() => void handleSignOut()}
        pendingCount={pendingManagerCount}
      />

      {/* إشعارات العمليات */}
      {toast && (
        <div className="fixed bottom-5 left-5 z-50 flex max-w-md items-center gap-2.5 rounded-xl border bg-white px-4 py-3 shadow-sm text-xs font-medium">
          {toast.isError ? (
            <AlertCircle className="h-4 w-4 shrink-0 text-[#B91C1C]" />
          ) : (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-[#14532D]" />
          )}
          <span className={toast.isError ? 'text-[#991B1B]' : 'text-[#1C1917]'}>
            {toast.message}
          </span>
          <button
            type="button"
            onClick={() => setToast(null)}
            aria-label="إغلاق الإشعار"
            className="mr-2 text-[#78716C] hover:text-[#1C1917] cursor-pointer"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {authLoading ? (
        <div className="flex flex-1 items-center justify-center p-12">
          <p className="text-sm text-[#57534E]">جاري التحقق من الجلسة وتحميل سجل العائلة...</p>
        </div>
      ) : !profile ? (
        <div className="flex-1">
          <ErrorBoundary fallbackTitle="تعذر عرض شاشة تسجيل الدخول">
            <AuthScreen
              onAuthSuccess={() => void loadCurrentSession()}
              onHoldAuthRedirect={(hold) => {
                holdAuthRedirectRef.current = hold;
              }}
            />
          </ErrorBoundary>
        </div>
      ) : (
        <div className="flex-1">
          {activeTab === 'tree' && (
            <section
              aria-label="الشعار الرسمي لشجرة عشيرة بني قطيف"
              className="border-b border-[#E5E0D5] bg-[#FAF8F4]"
            >
              <div className="mx-auto max-w-[1440px] px-6 py-5">
                <div className="flex flex-col items-center gap-5 rounded-xl border border-[#D6CEBE] bg-white p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
                  <div className="flex flex-col items-center gap-5 text-center sm:flex-row sm:text-right">
                    <div className="h-24 w-24 shrink-0 overflow-hidden rounded-xl border-2 border-[#D6CEBE] bg-[#FAF8F4] shadow-sm sm:h-28 sm:w-28">
                      <img
                        src="/assets/aistudio/image_6f64ce03_5e9cd2c7.jpg"
                        alt="شعار آل مال الله - شجرة عشيرة بني القطيف"
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-[#92400E]">
                        آل مال الله · الأرشيف النسبي الرقمي الموثق
                      </p>
                      <h1 className="font-heritage mt-1 text-2xl font-bold text-[#1C1917] sm:text-3xl">
                        شجرة عشيرة بني قطيف
                      </h1>
                      <p className="mt-1.5 max-w-2xl text-xs leading-relaxed text-[#57534E] sm:text-sm">
                        البوابة الرسمية لحفظ أنساب العائلة وتسلسل الأجيال والفروع، واستعراض صلات القرابة وسير الأعلام.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setRadarInitialTargetB(null);
                      setIsRadarOpen(true);
                    }}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border-2 border-[#D4AF37] bg-[#0F2350] px-5 py-3 text-sm font-bold text-[#F6DF85] shadow-sm hover:bg-[#16326E] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Compass className="h-4 w-4 text-[#F6DF85]" />
                    <span>اكتشف صلة القرابة</span>
                  </button>
                </div>
              </div>
            </section>
          )}

          {/* شريط البحث الذكي ومساعد الدردشة في أعلى الصفحة */}
          <SmartSearchBar
            people={people}
            profiles={allProfiles}
            searchQuery={searchQuery}
            onSearchQueryChange={setSearchQuery}
            onSearchMatchedIdsChange={setSearchMatchedIds}
            onSelectSearchResult={(id) => {
              setSelectedPersonId(null);
              setHighlightedPersonId(id);
              setFocusRequest((prev) => ({ personId: id, seq: (prev?.seq ?? 0) + 1 }));
              setActiveTab('tree');
            }}
            onSelectPerson={(id) => {
              setHighlightedPersonId(id);
              setSelectedPersonId(id);
              setFocusRequest((prev) => ({ personId: id, seq: (prev?.seq ?? 0) + 1 }));
              setActiveTab('tree');
            }}
          />

          {activeTab === 'tree' && (
            <ErrorBoundary fallbackTitle="تعذر عرض شجرة العائلة">
              <FamilyTreeView
                people={people}
                profiles={allProfiles}
                loading={peopleLoading}
                currentUserId={profile.id}
                userRole={profile.role}
                searchQuery={searchQuery}
                searchMatchedIds={searchMatchedIds}
                selectedPersonId={selectedPersonId}
                highlightedPersonId={highlightedPersonId}
                focusRequest={focusRequest}
                kinshipRadarHighlight={kinshipRadarHighlight}
                onClearHighlight={() => setHighlightedPersonId(null)}
                onOpenKinshipRadar={() => {
                  setRadarInitialTargetB(null);
                  setIsRadarOpen(true);
                }}
                onClearKinshipRadar={() => setKinshipRadarHighlight(null)}
                onShareLineageCard={async (person) => {
                  try {
                    const linked = allProfiles.find((prof) => prof.person_id === person.id);
                    await downloadLineageShareCard(
                      person,
                      people,
                      person.nickname || linked?.nickname
                    );
                    showNotify(
                      `تم توليد وتنزيل بطاقة نسب "${person.full_name}" باللونين الأزرق الملكي والذهبي — جاهزة للمشاركة عبر واتساب.`
                    );
                  } catch (err) {
                    showNotify(
                      err instanceof Error ? err.message : 'تعذر توليد صورة بطاقة النسب.',
                      true
                    );
                  }
                }}
                onSelectPerson={(id) => {
                  setHighlightedPersonId(id);
                  setSelectedPersonId(id);
                }}
                onRequestEdit={(person) => {
                  if (!canEditOrDeletePerson(person, profile.id, profile.role)) return;
                  setEditModalState({
                    isOpen: true,
                    mode: isPrivilegedRole(profile.role) ? 'direct-update' : 'request-update',
                    targetPerson: person,
                    defaultFather: null,
                  });
                }}
                onDeletePerson={(person) => {
                  if (!canEditOrDeletePerson(person, profile.id, profile.role)) return;
                  setDeleteTargetPerson(person);
                }}
                onRequestAddMember={(father) =>
                  setEditModalState({
                    isOpen: true,
                    mode: 'request-create',
                    targetPerson: null,
                    defaultFather: father ?? null,
                  })
                }
                onDirectAddMember={(father) =>
                  setEditModalState({
                    isOpen: true,
                    mode: 'direct-create',
                    targetPerson: null,
                    defaultFather: father ?? null,
                  })
                }
              />
            </ErrorBoundary>
          )}

          {activeTab === 'kinship' && (
            <ErrorBoundary fallbackTitle="تعذر عرض حاسبة القرابة">
              <KinshipCalculator
                people={people}
                defaultPersonAId={profile.person_id}
                onSelectPerson={(id) => {
                  setHighlightedPersonId(id);
                  setSelectedPersonId(id);
                  setFocusRequest((prev) => ({ personId: id, seq: (prev?.seq ?? 0) + 1 }));
                  setActiveTab('tree');
                }}
                onHighlightTreePath={(highlight) => {
                  setSelectedPersonId(null);
                  setHighlightedPersonId(null);
                  setKinshipRadarHighlight(highlight);
                  setActiveTab('tree');
                }}
              />
            </ErrorBoundary>
          )}

          {activeTab === 'my-requests' && (
            <ErrorBoundary fallbackTitle="تعذر عرض سجل الطلبات">
              <MyRequestsView
                requests={(changeRequests || []).filter((r) => r?.requested_by === profile.id)}
                people={people}
                onNewRequest={() =>
                  setEditModalState({
                    isOpen: true,
                    mode: 'request-create',
                    targetPerson: null,
                    defaultFather: null,
                  })
                }
              />
            </ErrorBoundary>
          )}

          {activeTab === 'account' && (
            <ErrorBoundary fallbackTitle="تعذر عرض إعدادات الحساب">
              <AccountSettingsView
                profile={profile}
                onProfileUpdated={(updatedProfile) => {
                  setProfile(updatedProfile);
                  setAllProfiles((prev) =>
                    prev.map((item) => (item.id === updatedProfile.id ? updatedProfile : item))
                  );
                }}
                onNotify={showNotify}
              />
            </ErrorBoundary>
          )}

          {activeTab === 'admin' && isPrivilegedRole(profile.role) && (
            <ErrorBoundary fallbackTitle="تعذر عرض لوحة التحكم">
              <OwnerDashboard
              profile={profile}
              people={people}
              changeRequests={changeRequests}
              membershipRequests={membershipRequests}
              invitationCodes={invitationCodes}
              securityEvents={securityEvents}
              allProfiles={allProfiles}
              onRefreshAll={() => loadWorkspaceData(profile)}
              onChangeRequestUpdated={(updatedReq, treeMutation) => {
                setChangeRequests((prev) =>
                  prev.map((item) => (item.id === updatedReq.id ? updatedReq : item))
                );
                if (treeMutation?.type === 'delete') {
                  updatePeopleAndCache((prev) =>
                    prev.filter((p) => p.id !== treeMutation.targetId)
                  );
                } else if (treeMutation?.type === 'create') {
                  const lightPerson = toLightweightFamilyPerson(treeMutation.person);
                  updatePeopleAndCache((prev) =>
                    prev.some((p) => p.id === lightPerson.id) ? prev : [...prev, lightPerson]
                  );
                } else if (treeMutation?.type === 'update') {
                  const lightPerson = toLightweightFamilyPerson(treeMutation.person);
                  updatePeopleAndCache((prev) =>
                    prev.map((p) => (p.id === lightPerson.id ? lightPerson : p))
                  );
                }
              }}
              onMembershipRequestUpdated={(updatedMembership, createdCode, upsertedProfile) => {
                setMembershipRequests((prev) =>
                  prev.map((item) => (item.id === updatedMembership.id ? updatedMembership : item))
                );
                if (createdCode) {
                  setInvitationCodes((prev) =>
                    prev.some((c) => c.code === createdCode.code) ? prev : [createdCode, ...prev]
                  );
                }
                if (upsertedProfile) {
                  setAllProfiles((prev) => {
                    const exists = prev.some((p) => p.id === upsertedProfile.id);
                    return exists
                      ? prev.map((p) => (p.id === upsertedProfile.id ? upsertedProfile : p))
                      : [upsertedProfile, ...prev];
                  });
                }
              }}
              onCodeCreated={(createdCode) => {
                setInvitationCodes((prev) =>
                  prev.some((c) => c.code === createdCode.code) ? prev : [createdCode, ...prev]
                );
              }}
              onProfileUpdated={(updatedProfile) => {
                setAllProfiles((prev) => {
                  const exists = prev.some((p) => p.id === updatedProfile.id);
                  return exists
                    ? prev.map((p) => (p.id === updatedProfile.id ? updatedProfile : p))
                    : [updatedProfile, ...prev];
                });
              }}
              onSecurityEventResolved={(eventId) => {
                setSecurityEvents((prev) =>
                  prev.map((ev) => (ev.id === eventId ? { ...ev, resolved: true } : ev))
                );
              }}
              onNotify={showNotify}
            />
            </ErrorBoundary>
          )}
        </div>
      )}

      {/* بطاقة تفاصيل الفرد وسلسلة النسب */}
      {profile && (
        <MemberDossierModal
          person={selectedPerson}
          people={people}
          profiles={allProfiles}
          currentUserId={profile.id}
          userRole={profile.role}
          onClose={() => setSelectedPersonId(null)}
          onSelectPerson={(id) => setSelectedPersonId(id)}
          onDirectEdit={(person) => {
            if (!canEditOrDeletePerson(person, profile.id, profile.role)) return;
            setSelectedPersonId(null);
            setEditModalState({
              isOpen: true,
              mode: isPrivilegedRole(profile.role) ? 'direct-update' : 'request-update',
              targetPerson: person,
              defaultFather: null,
            });
          }}
          onDirectAddChild={(parent) => {
            setSelectedPersonId(null);
            setEditModalState({
              isOpen: true,
              mode: 'direct-create',
              targetPerson: null,
              defaultFather: parent,
            });
          }}
          onRequestAddChild={(parent) => {
            setSelectedPersonId(null);
            setEditModalState({
              isOpen: true,
              mode: 'request-create',
              targetPerson: null,
              defaultFather: parent,
            });
          }}
          onDeletePerson={(person) => {
            if (!canEditOrDeletePerson(person, profile.id, profile.role)) return;
            setSelectedPersonId(null);
            setDeleteTargetPerson(person);
          }}
          onOpenRadarWithPerson={(person) => {
            setSelectedPersonId(null);
            setRadarInitialTargetB(person.id);
            setIsRadarOpen(true);
          }}
          onNotify={showNotify}
        />
      )}

      {/* رادار صلة القرابة التفاعلي */}
      {profile && isRadarOpen && (
        <KinshipRadarModal
          isOpen={isRadarOpen}
          people={people}
          profile={profile}
          initialPersonBId={radarInitialTargetB}
          onClose={() => setIsRadarOpen(false)}
          onHighlightTreePath={(highlight) => {
            setSelectedPersonId(null);
            setHighlightedPersonId(null);
            setKinshipRadarHighlight(highlight);
            setActiveTab('tree');
          }}
        />
      )}

      {/* نافذة الحذف المباشر (للمطور والمشرف) أو طلب الحذف بسبب (لمضيف الاسم) */}
      {profile && deleteTargetPerson && (
        <DeletePersonModal
          person={deleteTargetPerson}
          profile={profile}
          onClose={() => setDeleteTargetPerson(null)}
          onSuccess={(msg) => {
            const removedId = deleteTargetPerson.id;
            setDeleteTargetPerson(null);
            setSelectedPersonId(null);
            if (isPrivilegedRole(profile.role)) {
              updatePeopleAndCache((prev) => prev.filter((p) => p.id !== removedId));
            }
            showNotify(msg);
            void loadWorkspaceData(profile);
          }}
          onError={(msg) => {
            showNotify(msg, true);
          }}
        />
      )}

      {/* نافذة تقديم طلب تعديل أو إضافة فرد */}
      {profile && editModalState.isOpen && (
        <ChangeRequestModal
          isOpen={editModalState.isOpen}
          mode={editModalState.mode}
          targetPerson={editModalState.targetPerson}
          defaultFather={editModalState.defaultFather}
          people={people}
          profile={profile}
          onClose={() =>
            setEditModalState((prev) => ({
              ...prev,
              isOpen: false,
            }))
          }
          onSuccess={(msg, options) => {
            if (options?.savedPerson) {
              const savedLight = toLightweightFamilyPerson(options.savedPerson);
              updatePeopleAndCache((prev) => {
                const exists = prev.some((p) => p.id === savedLight.id);
                return exists
                  ? prev.map((p) => (p.id === savedLight.id ? savedLight : p))
                  : [...prev, savedLight];
              });
            }
            showNotify(msg);
            void loadWorkspaceData(profile);
          }}
          onError={(msg) => {
            showNotify(msg, true);
          }}
        />
      )}

      {/* نافذة تعيين كلمة المرور الجديدة عند فتح رابط استعادة كلمة المرور */}
      <ResetPasswordModal
        isOpen={isPasswordResetOpen}
        onClose={() => {
          setIsPasswordResetOpen(false);
          if (window.location.hash.includes('type=recovery') || window.location.search.includes('type=recovery')) {
            window.history.replaceState({}, document.title, window.location.pathname);
          }
        }}
        onSuccess={(message) => {
          setIsPasswordResetOpen(false);
          showNotify(message);
          void loadCurrentSession();
        }}
      />

      <footer className="border-t border-[#E5E0D5] bg-[#FAF8F4] px-6 py-4 text-center text-xs text-[#78716C]">
        شجرة عائلة بني قطيف · أرشيف الأنساب الرقمي
      </footer>
    </div>
  );
}
