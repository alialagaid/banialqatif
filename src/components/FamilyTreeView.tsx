import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Award,
  ChevronDown,
  ChevronUp,
  Compass,
  Crosshair,
  Edit3,
  GitBranch,
  Map as MapIcon,
  Maximize2,
  Minimize2,
  Minus,
  Plus,
  Share2,
  Sparkles,
  Table2,
  Trash2,
  User,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type { FamilyPerson, Profile, UserRole } from '../types/database';
import {
  getPersonBirthDisplay,
  getPersonDeathDisplay,
  getPersonTribeTitle,
} from '../utils/familyPersonDb';
import { computeHeritageTreeLayout } from '../utils/heritageTreeLayout';
import {
  buildFamilyForest,
  buildLineageChain,
  canEditOrDeletePerson,
  createPeopleMap,
  isPrivilegedRole,
  normalizeArabicSearchText,
  stripPatronymicConnectors,
  type KinshipRadarHighlight,
} from '../utils/kinship';
import {
  computeSmartTreeLayout,
  TREE_CARD_HEIGHT,
  TREE_CARD_WIDTH,
  type LayoutNode,
} from '../utils/treeLayout';
import { HeritagePlaqueCanvas } from './HeritagePlaqueCanvas';

interface FamilyTreeViewProps {
  people: FamilyPerson[];
  profiles?: Profile[];
  loading: boolean;
  currentUserId: string;
  userRole: UserRole;
  searchQuery: string;
  searchMatchedIds?: string[];
  selectedPersonId: string | null;
  highlightedPersonId?: string | null;
  focusRequest?: { personId: string; seq: number } | null;
  kinshipRadarHighlight?: KinshipRadarHighlight | null;
  onClearHighlight?: () => void;
  onOpenKinshipRadar?: () => void;
  onClearKinshipRadar?: () => void;
  onShareLineageCard?: (person: FamilyPerson) => void;
  onSelectPerson: (personId: string) => void;
  onRequestEdit: (person: FamilyPerson) => void;
  onDeletePerson: (person: FamilyPerson) => void;
  onRequestAddMember: (parentPerson?: FamilyPerson | null) => void;
  onDirectAddMember: (parentPerson?: FamilyPerson | null) => void;
}

interface CameraState {
  x: number;
  y: number;
  scale: number;
}

const MIN_ZOOM = 0.12;
const MAX_ZOOM = 2.2;
const DEFAULT_CAMERA: CameraState = { x: 0, y: 24, scale: 1 };
const DEFAULT_DRAG_START = { clientX: 0, clientY: 0, camX: 0, camY: 0 };

function clampZoom(scale: number): number {
  const safeScale = Number.isFinite(scale) ? scale : 1;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, safeScale));
}

export const FamilyTreeView: React.FC<FamilyTreeViewProps> = ({
  people: rawPeople = [],
  profiles = [],
  loading,
  currentUserId,
  userRole,
  searchQuery = '',
  searchMatchedIds = [],
  selectedPersonId,
  highlightedPersonId = null,
  focusRequest = null,
  kinshipRadarHighlight = null,
  onClearHighlight,
  onOpenKinshipRadar,
  onClearKinshipRadar,
  onShareLineageCard,
  onSelectPerson,
  onRequestEdit,
  onDeletePerson,
  onRequestAddMember,
  onDirectAddMember,
}) => {
  const people = useMemo(
    () =>
      Array.isArray(rawPeople)
        ? rawPeople.filter((p): p is FamilyPerson => Boolean(p && typeof p.id === 'string' && p.id))
        : [],
    [rawPeople]
  );

  const [viewMode, setViewMode] = useState<'heritage' | 'modern' | 'table'>('heritage');
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const [branchFilter, setBranchFilter] = useState<string>('all');
  const [showMinimap, setShowMinimap] = useState(true);
  const [focusTrigger, setFocusTrigger] = useState(0);

  // حالة الكاميرا (التحريك والتكبير)
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [viewportSize, setViewportSize] = useState({ width: 960, height: 580 });
  const [camera, setCamera] = useState<CameraState>({ x: 0, y: 24, scale: 1 });
  const cameraRef = useRef<CameraState>(camera);
  cameraRef.current = camera;

  const [animateCamera, setAnimateCamera] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const hasInitialCenteredRef = useRef(false);
  const pendingFocusPersonIdRef = useRef<string | null>(null);
  const pendingCenterFounderRef = useRef(false);
  const lastFocusedSelectedIdRef = useRef<string | null>(null);
  const lastHandledFocusSeqRef = useRef<number>(0);

  // تتبع مؤشرات السحب واللمس المتعدد (Pinch & Pan)
  const activePointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const dragStartRef = useRef<{
    clientX: number;
    clientY: number;
    camX: number;
    camY: number;
  } | null>(null);
  const pinchStartRef = useRef<{
    distance: number;
    scale: number;
    midX: number;
    midY: number;
    camX: number;
    camY: number;
  } | null>(null);
  const didDragRef = useRef(false);

  const isManager = isPrivilegedRole(userRole);
  const peopleMap = useMemo(() => createPeopleMap(people), [people]);

  const profileByPersonId = useMemo(() => {
    const map = new Map<string, Profile>();
    if (!Array.isArray(profiles)) return map;
    for (const prof of profiles) {
      if (prof && prof.person_id) {
        map.set(prof.person_id, prof);
      }
    }
    return map;
  }, [profiles]);

  const branches = useMemo(() => {
    const set = new Set<string>();
    for (const p of people) {
      const tribe = getPersonTribeTitle(p);
      if (tribe) {
        set.add(tribe);
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ar'));
  }, [people]);

  const rpcMatchIdSet = useMemo(() => new Set(searchMatchedIds || []), [searchMatchedIds]);

  const matchedPeople = useMemo(() => {
    const q = normalizeArabicSearchText(searchQuery);
    const strippedQ = stripPatronymicConnectors(q);
    if (!q && rpcMatchIdSet.size === 0) return [];
    const tokens = strippedQ.split(' ').filter(Boolean);

    return people.filter((p) => {
      if (rpcMatchIdSet.has(p.id)) return true;
      if (!q) return false;
      const linked = profileByPersonId.get(p.id);
      const nickname = normalizeArabicSearchText(p.nickname || linked?.nickname);
      const normFull = normalizeArabicSearchText(p.full_name);
      const normBranch = normalizeArabicSearchText(getPersonTribeTitle(p));
      const normLocation = normalizeArabicSearchText(p.location);

      if (
        normFull.includes(q) ||
        nickname.includes(q) ||
        normBranch.includes(q) ||
        normLocation.includes(q)
      ) {
        return true;
      }

      if (tokens.length >= 2) {
        const { chainText } = buildLineageChain(p.id, peopleMap);
        const strippedLineage = stripPatronymicConnectors(normalizeArabicSearchText(chainText));
        return tokens.every(
          (t) =>
            strippedLineage.includes(t) ||
            normFull.includes(t) ||
            nickname.includes(t) ||
            normBranch.includes(t)
        );
      }
      return false;
    });
  }, [people, searchQuery, profileByPersonId, rpcMatchIdSet, peopleMap]);

  const matchedIdSet = useMemo(() => {
    const set = new Set(matchedPeople.map((p) => p.id));
    for (const id of rpcMatchIdSet) {
      set.add(id);
    }
    if (highlightedPersonId) {
      set.add(highlightedPersonId);
    }
    return set;
  }, [matchedPeople, rpcMatchIdSet, highlightedPersonId]);

  const radarPathIdSet = useMemo(
    () => new Set(kinshipRadarHighlight?.pathIds ?? []),
    [kinshipRadarHighlight]
  );
  const isRadarActive = radarPathIdSet.size > 0;

  const filteredPeople = useMemo(() => {
    const q = (searchQuery || '').trim().toLowerCase();
    return people.filter((p) => {
      const matchesBranch = branchFilter === 'all' || getPersonTribeTitle(p) === branchFilter;
      if (!q) return matchesBranch;
      return matchesBranch && matchedIdSet.has(p.id);
    });
  }, [people, branchFilter, searchQuery, matchedIdSet]);

  const forest = useMemo(() => {
    if (branchFilter === 'all') {
      return buildFamilyForest(people);
    }
    const branchSet = new Set(
      people.filter((p) => getPersonTribeTitle(p) === branchFilter).map((p) => p.id)
    );
    const keepIds = new Set<string>(branchSet);
    for (const id of branchSet) {
      let cur = peopleMap.get(id);
      while (cur?.father_id && peopleMap.has(cur.father_id)) {
        keepIds.add(cur.father_id);
        cur = peopleMap.get(cur.father_id);
      }
    }
    return buildFamilyForest(people.filter((p) => keepIds.has(p.id)));
  }, [people, branchFilter, peopleMap]);

  const layout = useMemo(
    () => computeSmartTreeLayout(forest, collapsedIds),
    [forest, collapsedIds]
  );

  const heritageLayout = useMemo(
    () => computeHeritageTreeLayout(forest),
    [forest]
  );

  const isCanvasMode = viewMode === 'heritage' || viewMode === 'modern';
  const activeCanvasWidth =
    (viewMode === 'heritage' ? heritageLayout?.width : layout?.width) ?? 0;
  const activeCanvasHeight =
    (viewMode === 'heritage' ? heritageLayout?.height : layout?.height) ?? 0;

  const founderPerson = useMemo(() => {
    if (people.length === 0 || !Array.isArray(forest) || forest.length === 0) return null;
    return forest[0]?.person ?? null;
  }, [people.length, forest]);

  const hasFounderNode = useMemo(() => {
    if (people.length === 0 || !founderPerson) return false;
    if (viewMode === 'heritage') {
      const firstHeritageNode =
        heritageLayout?.nodes?.find((n) => n?.kind === 'founder-medallion') ??
        heritageLayout?.nodes?.[0];
      return Boolean(
        firstHeritageNode &&
          Number.isFinite(firstHeritageNode?.x) &&
          Number.isFinite(firstHeritageNode?.y)
      );
    }
    if (viewMode === 'modern') {
      const firstRootId = layout?.rootIds?.[0];
      const rootNode = firstRootId ? layout?.nodeMap?.get(firstRootId) : layout?.nodes?.[0];
      return Boolean(rootNode && Number.isFinite(rootNode?.x) && Number.isFinite(rootNode?.y));
    }
    return true;
  }, [people.length, founderPerson, viewMode, heritageLayout, layout]);

  const canRenderTree = people.length > 0 && Boolean(founderPerson) && hasFounderNode;

  // مراقبة أبعاد نافذة العرض لحساب التمركز والخريطة المصغرة بدقة
  useEffect(() => {
    if (!canRenderTree) return;
    const el = viewportRef.current;
    if (!el) return;

    const updateSize = () => {
      const rect = el?.getBoundingClientRect();
      if (rect && rect.width > 0 && rect.height > 0) {
        setViewportSize({ width: rect.width, height: rect.height });
      }
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(el);
    return () => observer.disconnect();
  }, [viewMode, canRenderTree]);

  const centerOnCoordinates = useCallback(
    (worldX: number, worldY: number, targetScale?: number, topAlign = false) => {
      if (people.length === 0 || !founderPerson) return;
      if (!Number.isFinite(worldX) || !Number.isFinite(worldY)) return;

      const el = viewportRef.current;
      const rect = el?.getBoundingClientRect();
      const vw = rect?.width || viewportSize?.width || 960;
      const vh = rect?.height || viewportSize?.height || 580;
      const currentScale = cameraRef.current?.scale ?? DEFAULT_CAMERA.scale;
      const scale = clampZoom(targetScale ?? currentScale);

      const x = vw / 2 - worldX * scale;
      const y = topAlign ? 36 - worldY * scale : vh / 2 - worldY * scale;
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;

      setAnimateCamera(true);
      setCamera({ x, y, scale });
    },
    [people.length, founderPerson, viewportSize?.width, viewportSize?.height]
  );

  const centerOnFounder = useCallback(() => {
    if (people.length === 0 || !founderPerson) return;

    const rect = viewportRef.current?.getBoundingClientRect();
    const vw = rect?.width || viewportSize?.width || 960;
    const vh = rect?.height || viewportSize?.height || 580;

    if (viewMode === 'heritage') {
      const heritageNodes = heritageLayout?.nodes ?? [];
      if (heritageNodes.length === 0) return;
      const hw = heritageLayout?.width ?? 0;
      const hh = heritageLayout?.height ?? 0;
      if (hw <= 0 || hh <= 0) return;
      const fitScale = clampZoom(
        Math.min((vw - 24) / Math.max(1, hw), (vh - 24) / Math.max(1, hh))
      );
      centerOnCoordinates(hw / 2, hh / 2, fitScale, false);
      return;
    }

    const modernNodes = layout?.nodes ?? [];
    if (modernNodes.length === 0) return;
    const firstRootId = layout?.rootIds?.[0];
    const rootNode = firstRootId ? layout?.nodeMap?.get(firstRootId) : modernNodes[0];
    if (!rootNode || !Number.isFinite(rootNode?.x) || !Number.isFinite(rootNode?.y)) return;

    const idealScale = vw < 640 ? 0.72 : 0.95;

    centerOnCoordinates(
      (rootNode?.x ?? 0) + TREE_CARD_WIDTH / 2,
      rootNode?.y ?? 0,
      idealScale,
      true
    );
  }, [
    people.length,
    founderPerson,
    viewMode,
    heritageLayout,
    layout,
    viewportSize?.width,
    viewportSize?.height,
    centerOnCoordinates,
  ]);

  // التمركز التلقائي عند التحميل الأول أو التبديل بين أنماط العرض
  const prevViewModeRef = useRef(viewMode);
  useEffect(() => {
    if (!isCanvasMode || !canRenderTree) return;

    if (!hasInitialCenteredRef.current || prevViewModeRef.current !== viewMode) {
      hasInitialCenteredRef.current = true;
      prevViewModeRef.current = viewMode;
      const raf = requestAnimationFrame(() => {
        centerOnFounder();
      });
      return () => cancelAnimationFrame(raf);
    }
  }, [isCanvasMode, canRenderTree, viewMode, centerOnFounder]);

  // فتح مسار الآباء تلقائياً والتركيز على الفرد عند البحث أو الاختيار
  const expandAncestorsAndFocus = useCallback(
    (personId: string) => {
      const ancestorsToOpen = new Set<string>();
      let cur = peopleMap.get(personId);
      const visited = new Set<string>();
      while (cur?.father_id && !visited.has(cur.father_id)) {
        visited.add(cur.father_id);
        ancestorsToOpen.add(cur.father_id);
        cur = peopleMap.get(cur.father_id);
      }

      pendingFocusPersonIdRef.current = personId;

      if (ancestorsToOpen.size > 0) {
        setCollapsedIds((prev) => {
          let changed = false;
          const next = new Set(prev);
          for (const ancId of ancestorsToOpen) {
            if (next.delete(ancId)) changed = true;
          }
          return changed ? next : prev;
        });
      }

      setFocusTrigger((n) => n + 1);
    },
    [peopleMap]
  );

  // تنفيذ التركيز وفتح مسار الآباء عند اختيار نتيجة من القائمة المنسدلة للبحث
  useEffect(() => {
    if (!focusRequest || !focusRequest.personId) return;
    if (focusRequest.seq === lastHandledFocusSeqRef.current) return;
    lastHandledFocusSeqRef.current = focusRequest.seq;

    hasInitialCenteredRef.current = true;

    const targetPerson = peopleMap.get(focusRequest.personId);
    if (
      branchFilter !== 'all' &&
      targetPerson &&
      getPersonTribeTitle(targetPerson) !== branchFilter
    ) {
      setBranchFilter('all');
    }

    if (viewMode === 'table') {
      setViewMode('heritage');
    }

    expandAncestorsAndFocus(focusRequest.personId);
  }, [focusRequest, peopleMap, branchFilter, viewMode, expandAncestorsAndFocus]);

  // فتح مسار الرادار الذهبي وتوسيع الفروع تلقائياً والتركيز على الجد الجامع أو المسار
  useEffect(() => {
    if (!kinshipRadarHighlight || kinshipRadarHighlight.pathIds.length === 0) return;

    hasInitialCenteredRef.current = true;
    if (branchFilter !== 'all') {
      setBranchFilter('all');
    }
    if (viewMode === 'table') {
      setViewMode('heritage');
    }

    const ancestorsToOpen = new Set<string>();
    for (const id of kinshipRadarHighlight.pathIds) {
      let cur = peopleMap.get(id);
      const visited = new Set<string>();
      while (cur?.father_id && !visited.has(cur.father_id)) {
        visited.add(cur.father_id);
        ancestorsToOpen.add(cur.father_id);
        cur = peopleMap.get(cur.father_id);
      }
    }

    if (ancestorsToOpen.size > 0) {
      setCollapsedIds((prev) => {
        let changed = false;
        const next = new Set(prev);
        for (const ancId of ancestorsToOpen) {
          if (next.delete(ancId)) changed = true;
        }
        return changed ? next : prev;
      });
    }

    pendingFocusPersonIdRef.current =
      kinshipRadarHighlight.commonAncestorId || kinshipRadarHighlight.personAId;
    setFocusTrigger((n) => n + 1);
  }, [kinshipRadarHighlight, peopleMap, branchFilter, viewMode]);

  // التركيز التلقائي عند اختيار شخص من البحث الذكي أو حاسبة القرابة
  useEffect(() => {
    if (!selectedPersonId) {
      lastFocusedSelectedIdRef.current = null;
      return;
    }
    if (selectedPersonId === lastFocusedSelectedIdRef.current) return;
    lastFocusedSelectedIdRef.current = selectedPersonId;
    if (isCanvasMode) {
      expandAncestorsAndFocus(selectedPersonId);
    }
  }, [selectedPersonId, isCanvasMode, expandAncestorsAndFocus]);

  // تنفيذ حركة الكاميرا نحو البطاقة المستهدفة أو إعادة التمركز بمجرد تحديث الإحداثيات
  useEffect(() => {
    if (!isCanvasMode || !canRenderTree) return;

    if (pendingCenterFounderRef.current) {
      pendingCenterFounderRef.current = false;
      centerOnFounder();
      return;
    }

    const targetId = pendingFocusPersonIdRef.current;
    if (!targetId) return;

    const currentScale = cameraRef.current?.scale ?? DEFAULT_CAMERA.scale;

    if (viewMode === 'heritage') {
      const hNode = heritageLayout?.nodeMap?.get(targetId);
      if (!hNode || !Number.isFinite(hNode?.x) || !Number.isFinite(hNode?.y)) return;
      pendingFocusPersonIdRef.current = null;
      const targetScale = Math.max(
        currentScale,
        (viewportSize?.width ?? 960) < 640 ? 0.85 : 1.05
      );
      centerOnCoordinates(hNode?.x ?? 0, hNode?.y ?? 0, targetScale, false);
      return;
    }

    const node = layout?.nodeMap?.get(targetId);
    if (!node || !Number.isFinite(node?.x) || !Number.isFinite(node?.y)) return;

    pendingFocusPersonIdRef.current = null;
    const targetScale = Math.max(
      currentScale,
      (viewportSize?.width ?? 960) < 640 ? 0.85 : 1
    );
    centerOnCoordinates(
      (node?.x ?? 0) + TREE_CARD_WIDTH / 2,
      (node?.y ?? 0) + TREE_CARD_HEIGHT / 2,
      targetScale,
      false
    );
  }, [
    isCanvasMode,
    canRenderTree,
    viewMode,
    heritageLayout,
    layout,
    focusTrigger,
    viewportSize?.width,
    centerOnCoordinates,
    centerOnFounder,
  ]);

  // التكبير والتصغير بعجلة الفأرة متمركزاً حول المؤشر
  useEffect(() => {
    const el = viewportRef.current;
    if (!el || !isCanvasMode || !canRenderTree) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el?.getBoundingClientRect();
      if (!rect) return;
      const pointerX = e.clientX - (rect?.left ?? 0);
      const pointerY = e.clientY - (rect?.top ?? 0);

      const factor = e.deltaY < 0 ? 1.1 : 0.9;
      const cur = cameraRef.current ?? DEFAULT_CAMERA;
      const curScale = cur?.scale || 1;
      const curCam = { camX: cur?.x ?? 0, camY: cur?.y ?? 0 };
      const nextScale = clampZoom(curScale * factor);
      if (nextScale === curScale) return;

      const worldX = (pointerX - curCam.camX) / curScale;
      const worldY = (pointerY - curCam.camY) / curScale;

      setAnimateCamera(false);
      setCamera({
        scale: nextScale,
        x: pointerX - worldX * nextScale,
        y: pointerY - worldY * nextScale,
      });
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [isCanvasMode, canRenderTree]);

  function zoomByStep(delta: number) {
    if (!canRenderTree) return;
    const cur = cameraRef.current ?? DEFAULT_CAMERA;
    const curScale = cur?.scale || 1;
    const curCam = { camX: cur?.x ?? 0, camY: cur?.y ?? 0 };
    const nextScale = clampZoom(+(curScale + delta).toFixed(2));
    const cx = (viewportSize?.width ?? 960) / 2;
    const cy = (viewportSize?.height ?? 580) / 2;
    const worldX = (cx - curCam.camX) / curScale;
    const worldY = (cy - curCam.camY) / curScale;

    setAnimateCamera(true);
    setCamera({
      scale: nextScale,
      x: cx - worldX * nextScale,
      y: cy - worldY * nextScale,
    });
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!canRenderTree) return;
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    // لا تبدأ السحب إذا كان النقر مباشرة على زر تفاعلي أو الخريطة المصغرة
    if ((e.target as HTMLElement | null)?.closest?.('button, [data-minimap="true"]')) {
      return;
    }

    e.currentTarget?.setPointerCapture?.(e.pointerId);
    activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    didDragRef.current = false;
    setAnimateCamera(false);

    const safeCam = {
      camX: cameraRef.current?.x ?? 0,
      camY: cameraRef.current?.y ?? 0,
      scale: cameraRef.current?.scale || 1,
    };

    if (activePointersRef.current.size === 1) {
      setIsDragging(true);
      dragStartRef.current = {
        clientX: e.clientX,
        clientY: e.clientY,
        camX: safeCam.camX,
        camY: safeCam.camY,
      };
      pinchStartRef.current = null;
    } else if (activePointersRef.current.size === 2) {
      const pts = Array.from(activePointersRef.current.values());
      const p0 = pts[0];
      const p1 = pts[1];
      if (!p0 || !p1) return;
      const dist = Math.hypot((p1?.x ?? 0) - (p0?.x ?? 0), (p1?.y ?? 0) - (p0?.y ?? 0)) || 1;
      const rect = e.currentTarget?.getBoundingClientRect?.();
      pinchStartRef.current = {
        distance: dist,
        scale: safeCam.scale,
        midX: ((p0?.x ?? 0) + (p1?.x ?? 0)) / 2 - (rect?.left ?? 0),
        midY: ((p0?.y ?? 0) + (p1?.y ?? 0)) / 2 - (rect?.top ?? 0),
        camX: safeCam.camX,
        camY: safeCam.camY,
      };
      dragStartRef.current = null;
    }
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!canRenderTree) return;
    if (!activePointersRef.current.has(e.pointerId)) return;
    activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (activePointersRef.current.size === 2 && pinchStartRef.current) {
      const pts = Array.from(activePointersRef.current.values());
      const p0 = pts[0];
      const p1 = pts[1];
      if (!p0 || !p1) return;
      const dist = Math.hypot((p1?.x ?? 0) - (p0?.x ?? 0), (p1?.y ?? 0) - (p0?.y ?? 0)) || 1;
      const pinch = pinchStartRef.current;
      const baseScale = pinch?.scale || 1;
      const baseDistance = pinch?.distance || 1;
      const baseCam = { camX: pinch?.camX ?? 0, camY: pinch?.camY ?? 0 };
      const midX = pinch?.midX ?? 0;
      const midY = pinch?.midY ?? 0;
      const nextScale = clampZoom(baseScale * (dist / baseDistance));
      const worldX = (midX - baseCam.camX) / baseScale;
      const worldY = (midY - baseCam.camY) / baseScale;

      didDragRef.current = true;
      setCamera({
        scale: nextScale,
        x: midX - worldX * nextScale,
        y: midY - worldY * nextScale,
      });
      return;
    }

    if (activePointersRef.current.size === 1 && dragStartRef.current) {
      const dragStart = dragStartRef.current ?? DEFAULT_DRAG_START;
      const baseCam = { camX: dragStart?.camX ?? 0, camY: dragStart?.camY ?? 0 };
      const dx = e.clientX - (dragStart?.clientX ?? e.clientX);
      const dy = e.clientY - (dragStart?.clientY ?? e.clientY);
      if (Math.hypot(dx, dy) > 4) {
        didDragRef.current = true;
      }
      const nextX = baseCam.camX + dx;
      const nextY = baseCam.camY + dy;
      setCamera((prev) => ({
        ...(prev ?? DEFAULT_CAMERA),
        x: nextX,
        y: nextY,
      }));
    }
  }

  function handlePointerUpOrCancel(e: React.PointerEvent<HTMLDivElement>) {
    activePointersRef.current.delete(e.pointerId);
    if (activePointersRef.current.size === 0) {
      setIsDragging(false);
      dragStartRef.current = null;
      pinchStartRef.current = null;
    } else if (activePointersRef.current.size === 1) {
      const remaining = Array.from(activePointersRef.current.values())[0];
      const safeCam = {
        camX: cameraRef.current?.x ?? 0,
        camY: cameraRef.current?.y ?? 0,
      };
      dragStartRef.current = {
        clientX: remaining?.x ?? 0,
        clientY: remaining?.y ?? 0,
        camX: safeCam.camX,
        camY: safeCam.camY,
      };
      pinchStartRef.current = null;
    }
  }

  function toggleCollapse(id: string) {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function expandAll() {
    setCollapsedIds(new Set());
  }

  function collapseToFirstGeneration() {
    const parentIds = new Set<string>();
    for (const p of people) {
      if (p.father_id && peopleMap.has(p.father_id)) {
        parentIds.add(p.father_id);
      }
    }
    pendingCenterFounderRef.current = true;
    setCollapsedIds(parentIds);
  }

  function handleMinimapJump(e: React.MouseEvent<SVGSVGElement>) {
    if (!canRenderTree || activeCanvasWidth <= 0 || activeCanvasHeight <= 0) return;
    const rect = e.currentTarget?.getBoundingClientRect?.();
    if (!rect || rect.width <= 0 || rect.height <= 0) return;
    const clickRatioX = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const clickRatioY = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));

    const worldX = clickRatioX * activeCanvasWidth;
    const worldY = clickRatioY * activeCanvasHeight;
    centerOnCoordinates(worldX, worldY);
  }

  // حساب مستطيل الرؤية الحالي داخل الخريطة المصغرة (يُعطَّل عند غياب الجد المؤسس أو فراغ الشجرة)
  const minimapViewportRect = useMemo(() => {
    if (!canRenderTree) {
      return { x: 0, y: 0, w: 0, h: 0 };
    }
    const safeScale = camera?.scale || 1;
    const safeCam = { camX: camera?.x ?? 0, camY: camera?.y ?? 0 };
    const x = -safeCam.camX / safeScale;
    const y = -safeCam.camY / safeScale;
    const w = (viewportSize?.width ?? 960) / safeScale;
    const h = (viewportSize?.height ?? 580) / safeScale;
    return { x, y, w, h };
  }, [canRenderTree, camera, viewportSize]);

  if (loading) {
    return (
      <div className="mx-auto max-w-[1440px] px-6 py-8">
        <div className="rounded-xl border border-[#E5E0D5] bg-white p-8">
          <div className="h-6 w-56 animate-pulse rounded bg-[#EBE6DF]" />
          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-28 animate-pulse rounded-lg bg-[#FAF8F4]" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <section className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6">
      {/* شريط أدوات الشجرة */}
      <div className="mb-4 flex flex-col gap-3 rounded-xl border border-[#E5E0D5] bg-white p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          {/* تبديل العرض */}
          <div className="flex flex-wrap items-center gap-1 rounded-lg bg-[#F2EFE9] p-1">
            <button
              type="button"
              onClick={() => setViewMode('heritage')}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                viewMode === 'heritage'
                  ? 'bg-[#0F2350] text-[#F6DF85] shadow-xs'
                  : 'text-[#57534E] hover:text-[#1C1917]'
              }`}
            >
              <Award className="h-3.5 w-3.5" />
              <span>العرض التراثي المزخرف</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('modern')}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                viewMode === 'modern'
                  ? 'bg-white text-[#1C1917] shadow-xs'
                  : 'text-[#57534E] hover:text-[#1C1917]'
              }`}
            >
              <GitBranch className="h-3.5 w-3.5" />
              <span>العرض الهرمي الحديث</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                viewMode === 'table'
                  ? 'bg-white text-[#1C1917] shadow-xs'
                  : 'text-[#57534E] hover:text-[#1C1917]'
              }`}
            >
              <Table2 className="h-3.5 w-3.5" />
              <span>جدول الأنساب</span>
            </button>
          </div>

          {/* فلتر الفروع */}
          {branches.length > 0 && (
            <select
              value={branchFilter}
              onChange={(e) => setBranchFilter(e.target.value)}
              aria-label="تصفية حسب الفرع"
              className="rounded-lg border border-[#D6CEBE] bg-[#FAF8F4] px-3 py-1.5 text-xs text-[#1C1917] focus:border-[#14532D] focus:outline-none"
            >
              <option value="all">جميع الفروع ({people.length})</option>
              {branches.map((branch) => (
                <option key={branch} value={branch}>
                  فرع {branch}
                </option>
              ))}
            </select>
          )}

          <span className="text-xs text-[#57534E] tabular-nums">
            إجمالي المسجلين: <strong className="text-[#1C1917]">{people.length}</strong>
            {viewMode === 'modern' && layout.nodes.length !== people.length && (
              <span className="mr-1.5 text-[#78716C]">
                (المعروض حالياً: {layout.nodes.length})
              </span>
            )}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isCanvasMode && (
            <>
              {viewMode === 'modern' && (
                <>
                  <button
                    type="button"
                    onClick={expandAll}
                    className="inline-flex items-center gap-1 rounded-lg border border-[#D6CEBE] bg-white px-3 py-1.5 text-xs font-medium text-[#1C1917] hover:bg-[#F2EFE9] whitespace-nowrap cursor-pointer"
                  >
                    <Maximize2 className="h-3.5 w-3.5 text-[#14532D]" />
                    <span>توسيع الكل</span>
                  </button>
                  <button
                    type="button"
                    onClick={collapseToFirstGeneration}
                    className="inline-flex items-center gap-1 rounded-lg border border-[#D6CEBE] bg-white px-3 py-1.5 text-xs font-medium text-[#1C1917] hover:bg-[#F2EFE9] whitespace-nowrap cursor-pointer"
                  >
                    <Minimize2 className="h-3.5 w-3.5 text-[#92400E]" />
                    <span>طيّ الكل للجيل الأول</span>
                  </button>
                </>
              )}

              <div className="flex items-center gap-1 rounded-lg border border-[#D6CEBE] bg-[#FAF8F4] px-1.5 py-1">
                <button
                  type="button"
                  onClick={() => zoomByStep(-0.15)}
                  disabled={!canRenderTree}
                  aria-label="تصغير"
                  title="تصغير"
                  className="rounded p-1 text-[#57534E] hover:bg-white hover:text-[#1C1917] disabled:opacity-40 cursor-pointer"
                >
                  <ZoomOut className="h-3.5 w-3.5" />
                </button>
                <span className="w-11 text-center font-mono text-xs tabular-nums text-[#1C1917]">
                  {Math.round((camera?.scale ?? 1) * 100)}%
                </span>
                <button
                  type="button"
                  onClick={() => zoomByStep(0.15)}
                  disabled={!canRenderTree}
                  aria-label="تكبير"
                  title="تكبير"
                  className="rounded p-1 text-[#57534E] hover:bg-white hover:text-[#1C1917] disabled:opacity-40 cursor-pointer"
                >
                  <ZoomIn className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={centerOnFounder}
                  disabled={!canRenderTree}
                  aria-label="إعادة التمركز"
                  title={
                    viewMode === 'heritage'
                      ? 'عرض اللوحة التراثية كاملة'
                      : 'إعادة التمركز عند الجد المؤسس'
                  }
                  className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-[#14532D] hover:bg-white disabled:opacity-40 cursor-pointer"
                >
                  <Crosshair className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">
                    {viewMode === 'heritage' ? 'عرض اللوحة كاملة' : 'إعادة التمركز'}
                  </span>
                </button>
              </div>
            </>
          )}

          {onOpenKinshipRadar && (
            <button
              type="button"
              onClick={onOpenKinshipRadar}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#D4AF37] bg-[#0F2350] px-3.5 py-2 text-xs font-semibold text-[#F6DF85] hover:bg-[#16326E] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Compass className="h-3.5 w-3.5" />
              <span>اكتشف صلة القرابة</span>
            </button>
          )}

          {isManager ? (
            <button
              type="button"
              onClick={() => onDirectAddMember(null)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#14532D] px-3.5 py-2 text-xs font-medium text-white hover:bg-[#166534] whitespace-nowrap cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>إضافة فرد للشجرة</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onRequestAddMember(null)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#14532D] px-3.5 py-2 text-xs font-medium text-white hover:bg-[#166534] whitespace-nowrap cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>إضافة فرد جديد</span>
            </button>
          )}
        </div>
      </div>

      {/* حالة الفراغ أو عدم العثور على الجد المؤسس */}
      {!canRenderTree ? (
        <div className="rounded-2xl border border-[#D4AF37]/45 bg-gradient-to-b from-[#FAF8F4] to-white px-6 py-16 text-center shadow-sm">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border-2 border-[#D4AF37]/60 bg-[#0F2350] text-[#F6DF85] shadow-xs">
            <GitBranch className="h-7 w-7" />
          </div>
          <h2 className="font-heritage mt-5 text-2xl font-bold text-[#1C1917]">
            {people.length === 0
              ? 'مرحباً بكم في شجرة عائلة بني قطيف'
              : 'لم يتم العثور على الجد المؤسس للشجرة'}
          </h2>
          <p className="mx-auto mt-2.5 max-w-lg text-sm leading-relaxed text-[#57534E]">
            {people.length === 0
              ? isManager
                ? 'لم يتم إضافة أفراد للشجرة بعد. ابدأ ببناء السجل النسبي الموثق عبر إضافة الجد المؤسس ليتم ربط جميع الأجيال والفروع به.'
                : 'سجل الشجرة فارغ حالياً. يمكنك المبادرة بإضافة الجد المؤسس ليبدأ توثيق أجيال العائلة وفروعها.'
              : 'تحتوي قاعدة البيانات على سجلات غير مرتبطة بجد مؤسس واضح. أضف الجد المؤسس الآن لترتيب الأجيال وعرض الشجرة بشكل سليم.'}
          </p>
          <div className="mt-7 flex justify-center">
            <button
              type="button"
              onClick={() => (isManager ? onDirectAddMember(null) : onRequestAddMember(null))}
              className="inline-flex items-center gap-2 rounded-xl bg-[#14532D] px-7 py-3 text-sm font-semibold text-white shadow-xs hover:bg-[#166534] transition-colors cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              <span>إضافة الجد المؤسس</span>
            </button>
          </div>
        </div>
      ) : isCanvasMode ? (
        /* لوحة الشجرة التفاعلية (العرض التراثي المزخرف أو العرض الهرمي الحديث) */
        <div
          ref={viewportRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUpOrCancel}
          onPointerCancel={handlePointerUpOrCancel}
          className={`relative h-[70vh] min-h-[520px] max-h-[860px] w-full overflow-hidden rounded-xl border select-none touch-none ${
            viewMode === 'heritage'
              ? 'border-[#D4AF37]/60 bg-[#091636]'
              : 'border-[#E5E0D5] bg-[#FAF8F4]'
          } ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
          style={
            viewMode === 'modern'
              ? {
                  backgroundImage:
                    'radial-gradient(circle, rgba(214, 206, 190, 0.45) 1px, transparent 1px)',
                  backgroundSize: '24px 24px',
                }
              : undefined
          }
        >
          {/* تلميح التفاعل السريع في الزاوية العلوية */}
          <div
            className={`pointer-events-none absolute top-3 right-3 z-10 rounded-lg border px-3 py-1.5 text-[11px] backdrop-blur-xs ${
              viewMode === 'heritage'
                ? 'border-[#D4AF37]/45 bg-[#0F2350]/85 text-[#FAF3DF]'
                : 'border-[#E5E0D5] bg-white/90 text-[#57534E]'
            }`}
          >
            اسحب للتنقل · مرر أو قرّب للتكبير · اضغط على أي ورقة لعرض البطاقة الكاملة
          </div>

          {/* مسرح الشجرة المتحرك */}
          <div
            className={`absolute top-0 left-0 origin-top-left ${
              animateCamera ? 'transition-transform duration-300 ease-out' : ''
            }`}
            style={{
              width: activeCanvasWidth,
              height: activeCanvasHeight,
              transform: `translate3d(${camera?.x ?? 0}px, ${camera?.y ?? 0}px, 0) scale(${camera?.scale ?? 1})`,
            }}
          >
            {viewMode === 'heritage' ? (
              <HeritagePlaqueCanvas
                layout={heritageLayout}
                profileByPersonId={profileByPersonId}
                selectedPersonId={selectedPersonId || highlightedPersonId || null}
                matchedIdSet={matchedIdSet}
                radarPathIdSet={radarPathIdSet}
                radarAnchorIds={
                  kinshipRadarHighlight
                    ? {
                        personAId: kinshipRadarHighlight.personAId,
                        personBId: kinshipRadarHighlight.personBId,
                        commonAncestorId: kinshipRadarHighlight.commonAncestorId,
                      }
                    : null
                }
                didDragRef={didDragRef}
                onSelectPerson={onSelectPerson}
              />
            ) : (
              <>
                {/* طبقة خطوط الربط الهرمية */}
                <svg
                  width={layout.width}
                  height={layout.height}
                  className="pointer-events-none absolute inset-0"
                  aria-hidden="true"
                >
                  {layout.edges.map((edge) => {
                    const activeTargetId = selectedPersonId || highlightedPersonId;
                    const isRadarEdge =
                      isRadarActive &&
                      radarPathIdSet.has(edge.childId) &&
                      radarPathIdSet.has(edge.parentId);
                    const isActiveEdge =
                      isRadarEdge ||
                      (!isRadarActive &&
                        (activeTargetId === edge.childId ||
                          activeTargetId === edge.parentId ||
                          matchedIdSet.has(edge.childId)));

                    const pathD = `M ${edge.x1} ${edge.y1} L ${edge.x1} ${edge.midY} L ${edge.x2} ${edge.midY} L ${edge.x2} ${edge.y2}`;

                    return (
                      <g key={edge.id}>
                        {isRadarEdge && (
                          <path
                            d={pathD}
                            fill="none"
                            stroke="#FDE047"
                            strokeWidth={7.5}
                            strokeOpacity={0.55}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        )}
                        <path
                          d={pathD}
                          fill="none"
                          stroke={isRadarEdge ? '#D97706' : isActiveEdge ? '#14532D' : '#C7BFA9'}
                          strokeWidth={isRadarEdge ? 3.5 : isActiveEdge ? 2.4 : 1.75}
                          strokeOpacity={isRadarActive ? (isRadarEdge ? 1 : 0.16) : 1}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </g>
                    );
                  })}
                </svg>

                {/* بطاقات الأفراد */}
                {layout.nodes.map((node) => {
                  const isInRadarPath = isRadarActive && radarPathIdSet.has(node.person.id);
                  const isRadarAnchor =
                    isRadarActive &&
                    Boolean(
                      kinshipRadarHighlight &&
                        (kinshipRadarHighlight.personAId === node.person.id ||
                          kinshipRadarHighlight.personBId === node.person.id ||
                          kinshipRadarHighlight.commonAncestorId === node.person.id)
                    );

                  return (
                    <TreePersonCard
                      key={node.person.id}
                      node={node}
                      linkedProfile={profileByPersonId.get(node.person.id) ?? null}
                      currentUserId={currentUserId}
                      userRole={userRole}
                      isSelected={
                        selectedPersonId === node.person.id ||
                        highlightedPersonId === node.person.id
                      }
                      isMatched={matchedIdSet.has(node.person.id)}
                      isRadarHighlighted={isInRadarPath}
                      isRadarAnchor={isRadarAnchor}
                      isDimmedByRadar={isRadarActive && !isInRadarPath}
                      didDragRef={didDragRef}
                      onSelectPerson={onSelectPerson}
                      onToggleCollapse={toggleCollapse}
                      onRequestEdit={onRequestEdit}
                      onDeletePerson={onDeletePerson}
                      onShareLineageCard={onShareLineageCard}
                    />
                  );
                })}
              </>
            )}
          </div>

          {/* شريط رادار صلة القرابة المضيء عند تفعيله */}
          {kinshipRadarHighlight && isRadarActive && (
            <div className="absolute bottom-3 right-3 z-20 flex max-w-xl flex-wrap items-center gap-2.5 rounded-xl border border-[#D4AF37] bg-[#0F2350]/95 px-4 py-2.5 text-xs text-[#FAF3DF] shadow-lg backdrop-blur-xs">
              <Sparkles className="h-4 w-4 shrink-0 text-[#F6DF85]" />
              <div className="min-w-0">
                <p className="font-bold text-[#FFFFFF]">
                  {kinshipRadarHighlight.personAName} ↔ {kinshipRadarHighlight.personBName}
                  <span className="mr-2 font-semibold text-[#F6DF85]">
                    ({kinshipRadarHighlight.title})
                  </span>
                </p>
                <p className="mt-0.5 text-[11px] text-[#FAF3DF]/85 tabular-nums">
                  {kinshipRadarHighlight.commonAncestorName
                    ? `الجد الجامع: ${kinshipRadarHighlight.commonAncestorName} · الأجيال الفاصلة: ${kinshipRadarHighlight.totalGenerations}`
                    : 'مساران منفصلان بدون جد مشترك مباشر'}
                </p>
              </div>
              {onClearKinshipRadar && (
                <button
                  type="button"
                  onClick={onClearKinshipRadar}
                  className="mr-auto inline-flex items-center gap-1 rounded-lg border border-[#D4AF37]/60 bg-[#16326E] px-2.5 py-1 text-[11px] font-semibold text-[#F6DF85] hover:bg-[#1E40AF] whitespace-nowrap cursor-pointer"
                >
                  <X className="h-3 w-3" />
                  <span>إظهار كل الفروع</span>
                </button>
              )}
            </div>
          )}

          {/* شريط الفرد المحدد من البحث مع خيار فتح بطاقته */}
          {!isRadarActive && highlightedPersonId && peopleMap.has(highlightedPersonId) && (
            <div
              className={`absolute bottom-3 right-3 z-20 flex items-center gap-2 rounded-xl border px-3 py-2 text-xs shadow-md backdrop-blur-xs ${
                viewMode === 'heritage'
                  ? 'border-[#D4AF37]/70 bg-[#0F2350]/95 text-[#FAF3DF]'
                  : 'border-[#D97706]/50 bg-white/95 text-[#1C1917]'
              }`}
            >
              <span className="max-w-[160px] truncate font-semibold">
                {peopleMap.get(highlightedPersonId)?.full_name}
              </span>
              <button
                type="button"
                onClick={() => onSelectPerson(highlightedPersonId)}
                className={`rounded-md px-2 py-1 text-[11px] font-medium cursor-pointer ${
                  viewMode === 'heritage'
                    ? 'bg-[#D4AF37] text-[#0F2350] hover:bg-[#F6DF85]'
                    : 'bg-[#14532D] text-white hover:bg-[#166534]'
                }`}
              >
                عرض البطاقة
              </button>
              {onClearHighlight && (
                <button
                  type="button"
                  onClick={onClearHighlight}
                  aria-label="إلغاء التظليل"
                  className="rounded p-0.5 opacity-75 hover:opacity-100 cursor-pointer"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}

          {/* الخريطة المصغرة (Mini-map) في الزاوية السفلية */}
          <div
            data-minimap="true"
            className={`absolute bottom-3 left-3 z-20 rounded-xl border shadow-md backdrop-blur-xs overflow-hidden ${
              viewMode === 'heritage'
                ? 'border-[#D4AF37]/60 bg-[#0F2350]/95'
                : 'border-[#D6CEBE] bg-white/95'
            }`}
          >
            <div
              className={`flex items-center justify-between gap-2 border-b px-2.5 py-1.5 text-[10px] font-semibold ${
                viewMode === 'heritage'
                  ? 'border-[#D4AF37]/25 text-[#F6DF85]'
                  : 'border-[#F2EFE9] text-[#57534E]'
              }`}
            >
              <span className="inline-flex items-center gap-1">
                <MapIcon
                  className={`h-3 w-3 ${
                    viewMode === 'heritage' ? 'text-[#D4AF37]' : 'text-[#14532D]'
                  }`}
                />
                <span>خريطة الشجرة</span>
              </span>
              <button
                type="button"
                onClick={() => setShowMinimap((prev) => !prev)}
                aria-label={showMinimap ? 'طي الخريطة المصغرة' : 'فتح الخريطة المصغرة'}
                className={`rounded p-0.5 cursor-pointer ${
                  viewMode === 'heritage'
                    ? 'text-[#F6DF85]/80 hover:bg-white/10 hover:text-white'
                    : 'text-[#78716C] hover:bg-[#FAF8F4] hover:text-[#1C1917]'
                }`}
              >
                {showMinimap ? (
                  <ChevronDown className="h-3.5 w-3.5" />
                ) : (
                  <ChevronUp className="h-3.5 w-3.5" />
                )}
              </button>
            </div>

            {showMinimap && activeCanvasWidth > 0 && activeCanvasHeight > 0 && (
              <svg
                onClick={handleMinimapJump}
                viewBox={`0 0 ${activeCanvasWidth} ${activeCanvasHeight}`}
                preserveAspectRatio="xMidYMid meet"
                className={`h-24 w-40 cursor-pointer sm:h-28 sm:w-48 ${
                  viewMode === 'heritage' ? 'bg-[#091636]' : 'bg-[#FAF8F4]/70'
                }`}
                aria-label="خريطة مصغرة للشجرة"
              >
                {viewMode === 'heritage' ? (
                  <>
                    {heritageLayout.edges.map((edge) => (
                      <line
                        key={`mini-h-${edge.id}`}
                        x1={edge.x1}
                        y1={edge.y1}
                        x2={edge.x2}
                        y2={edge.y2}
                        stroke="#D4AF37"
                        strokeOpacity="0.4"
                        strokeWidth={Math.max(10, activeCanvasWidth * 0.003)}
                      />
                    ))}
                    {heritageLayout.nodes.map((node) => {
                      const isMatched = matchedIdSet.has(node.id);
                      const isSel =
                        selectedPersonId === node.id || highlightedPersonId === node.id;
                      return (
                        <circle
                          key={`mini-h-node-${node.id}`}
                          cx={node.x}
                          cy={node.y}
                          r={node.kind === 'founder-medallion' ? 70 : node.kind === 'branch-circle' ? 46 : 30}
                          fill={isMatched ? '#FEF08A' : isSel ? '#FFFFFF' : '#D4AF37'}
                        />
                      );
                    })}
                    <rect
                      x={minimapViewportRect.x}
                      y={minimapViewportRect.y}
                      width={minimapViewportRect.w}
                      height={minimapViewportRect.h}
                      fill="rgba(254, 240, 138, 0.14)"
                      stroke="#FEF08A"
                      strokeWidth={Math.max(18, activeCanvasWidth * 0.008)}
                    />
                  </>
                ) : (
                  <>
                    {layout.edges.map((edge) => (
                      <path
                        key={`mini-${edge.id}`}
                        d={`M ${edge.x1} ${edge.y1} L ${edge.x1} ${edge.midY} L ${edge.x2} ${edge.midY} L ${edge.x2} ${edge.y2}`}
                        fill="none"
                        stroke="#D6CEBE"
                        strokeWidth={Math.max(8, layout.width * 0.003)}
                      />
                    ))}
                    {layout.nodes.map((node) => {
                      const isMatched = matchedIdSet.has(node.person.id);
                      const isSel =
                        selectedPersonId === node.person.id ||
                        highlightedPersonId === node.person.id;
                      return (
                        <rect
                          key={`mini-node-${node.person.id}`}
                          x={node.x}
                          y={node.y}
                          width={TREE_CARD_WIDTH}
                          height={TREE_CARD_HEIGHT}
                          rx={20}
                          fill={isMatched ? '#D97706' : isSel ? '#14532D' : '#A8A29E'}
                        />
                      );
                    })}
                    {/* مؤشر موقع الكاميرا الحالي */}
                    <rect
                      x={minimapViewportRect.x}
                      y={minimapViewportRect.y}
                      width={minimapViewportRect.w}
                      height={minimapViewportRect.h}
                      fill="rgba(20, 83, 45, 0.14)"
                      stroke="#14532D"
                      strokeWidth={Math.max(14, layout.width * 0.006)}
                    />
                  </>
                )}
              </svg>
            )}
          </div>
        </div>
      ) : (
        /* جدول الأنساب */
        <div className="overflow-hidden rounded-xl border border-[#E5E0D5] bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead className="border-b border-[#E5E0D5] bg-[#FAF8F4] text-xs font-semibold text-[#57534E]">
                <tr>
                  <th className="px-4 py-3">الاسم والكنية</th>
                  <th className="px-4 py-3">اللقب / القبيلة أو الفخذ</th>
                  <th className="px-4 py-3">الجيل</th>
                  <th className="px-4 py-3">تاريخ الميلاد</th>
                  <th className="px-4 py-3">الحالة</th>
                  <th className="px-4 py-3">الإجراء</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F2EFE9]">
                {filteredPeople.map((person) => {
                  const father = person.father_id ? peopleMap.get(person.father_id) : null;
                  const { chainText } = buildLineageChain(person.id, peopleMap);
                  const canEdit = canEditOrDeletePerson(person, currentUserId, userRole);
                  const linked = profileByPersonId.get(person.id);
                  const avatarSrc = person.photo_url || person.avatar_url || linked?.avatar_url;
                  const nickname = person.nickname || linked?.nickname;
                  const tribeTitle = getPersonTribeTitle(person);
                  const birthDisplay = getPersonBirthDisplay(person);
                  const deathDisplay = getPersonDeathDisplay(person);
                  const alive = person.is_alive !== false;

                  return (
                    <tr
                      key={person.id}
                      className={`hover:bg-[#FAF8F4] transition-colors ${
                        selectedPersonId === person.id || highlightedPersonId === person.id
                          ? 'bg-[#14532D]/5'
                          : ''
                      }`}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 shrink-0 overflow-hidden rounded-lg border border-[#E5E0D5] bg-[#FAF8F4] flex items-center justify-center">
                            {avatarSrc ? (
                              <img
                                src={avatarSrc}
                                alt={person.full_name}
                                loading="lazy"
                                decoding="async"
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <User className="h-4 w-4 text-[#78716C]" />
                            )}
                          </div>
                          <div>
                            <button
                              type="button"
                              onClick={() => onSelectPerson(person.id)}
                              className="text-right font-semibold text-[#1C1917] hover:text-[#14532D] cursor-pointer"
                            >
                              {person.full_name}
                            </button>
                            {nickname && (
                              <span className="mr-2 text-xs font-medium text-[#92400E]">
                                ({nickname})
                              </span>
                            )}
                            {tribeTitle && (
                              <div className="mt-0.5 text-xs font-semibold text-[#92400E]">
                                {tribeTitle}
                              </div>
                            )}
                            <div className="mt-0.5 text-xs text-[#78716C] line-clamp-1">
                              {father ? `الأب: ${father.full_name}` : chainText}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs font-medium text-[#92400E]">
                        {tribeTitle || '—'}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs tabular-nums text-[#57534E]">
                        {person.generation ? `الجيل ${person.generation}` : '—'}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs tabular-nums text-[#57534E]">
                        {birthDisplay || '—'}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {alive ? (
                          <span className="inline-flex items-center gap-1 rounded border border-[#86EFAC] bg-[#DCFCE7] px-2 py-0.5 text-[11px] font-medium text-[#166534]">
                            <span className="h-1.5 w-1.5 rounded-full bg-[#16A34A]" />
                            <span>على قيد الحياة</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded border border-[#E7E5E4] bg-[#F5F5F4] px-2 py-0.5 text-[11px] font-medium text-[#57534E]">
                            <span>متوفى</span>
                            {deathDisplay && (
                              <span className="font-mono tabular-nums text-[10px]">
                                ({deathDisplay})
                              </span>
                            )}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => onSelectPerson(person.id)}
                            className="text-xs font-medium text-[#14532D] hover:underline whitespace-nowrap cursor-pointer"
                          >
                            عرض النسب
                          </button>
                          {onShareLineageCard && (
                            <button
                              type="button"
                              onClick={() => onShareLineageCard(person)}
                              className="inline-flex items-center gap-1 text-xs font-medium text-[#0F2350] hover:underline whitespace-nowrap cursor-pointer"
                            >
                              <Share2 className="h-3 w-3" />
                              <span>مشاركة نسبي</span>
                            </button>
                          )}
                          {canEdit && (
                            <>
                              <button
                                type="button"
                                onClick={() => onRequestEdit(person)}
                                className="text-xs font-medium text-[#92400E] hover:underline whitespace-nowrap cursor-pointer"
                              >
                                {isPrivilegedRole(userRole) ? 'تعديل بيانات الفرد' : 'طلب تعديل'}
                              </button>
                              <button
                                type="button"
                                onClick={() => onDeletePerson(person)}
                                className="text-xs font-medium text-[#B91C1C] hover:underline whitespace-nowrap cursor-pointer"
                              >
                                {isPrivilegedRole(userRole) ? 'حذف الفرد' : 'طلب حذف'}
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
};

interface TreePersonCardProps {
  node: LayoutNode;
  linkedProfile: Profile | null;
  currentUserId: string;
  userRole: UserRole;
  isSelected: boolean;
  isMatched: boolean;
  isRadarHighlighted?: boolean;
  isRadarAnchor?: boolean;
  isDimmedByRadar?: boolean;
  didDragRef: React.MutableRefObject<boolean>;
  onSelectPerson: (id: string) => void;
  onToggleCollapse: (id: string) => void;
  onRequestEdit: (person: FamilyPerson) => void;
  onDeletePerson: (person: FamilyPerson) => void;
  onShareLineageCard?: (person: FamilyPerson) => void;
}

const TreePersonCard: React.FC<TreePersonCardProps> = React.memo(
  ({
    node,
    linkedProfile,
    currentUserId,
    userRole,
    isSelected,
    isMatched,
    isRadarHighlighted = false,
    isRadarAnchor = false,
    isDimmedByRadar = false,
    didDragRef,
    onSelectPerson,
    onToggleCollapse,
    onRequestEdit,
    onDeletePerson,
    onShareLineageCard,
  }) => {
    const { person, x, y, totalChildrenCount, isCollapsed } = node;
    const canEdit = canEditOrDeletePerson(person, currentUserId, userRole);
    const avatarSrc = person.photo_url || person.avatar_url || linkedProfile?.avatar_url;
    const nickname = person.nickname || linkedProfile?.nickname;
    const tribeTitle = getPersonTribeTitle(person);
    const birthDisplay = getPersonBirthDisplay(person);
    const deathDisplay = getPersonDeathDisplay(person);
    const alive = person.is_alive !== false;
    const hasChildren = totalChildrenCount > 0;

    return (
      <div
        style={{
          width: TREE_CARD_WIDTH,
          height: TREE_CARD_HEIGHT,
          transform: `translate3d(${x}px, ${y}px, 0)`,
        }}
        className={`absolute top-0 left-0 flex flex-col justify-between rounded-xl border p-3 text-right transition-all duration-200 ${
          isDimmedByRadar ? 'opacity-25 saturate-50' : ''
        } ${
          isRadarHighlighted
            ? isRadarAnchor
              ? 'border-[#D4AF37] bg-[#FFFBEB] ring-4 ring-[#F59E0B]/50 shadow-lg z-20'
              : 'border-[#D4AF37] bg-[#FFFDF2] ring-2 ring-[#F59E0B]/35 shadow-md z-10'
            : isMatched
              ? 'border-[#B45309] bg-[#FFFBEB] ring-4 ring-[#F59E0B]/30 shadow-md z-10'
              : isSelected
                ? 'border-[#14532D] bg-white ring-3 ring-[#14532D]/25 shadow-md z-10'
                : 'border-[#D6CEBE] bg-white hover:border-[#14532D]/70 hover:shadow-sm'
        }`}
      >
        {/* الصف العلوي: الصورة + الاسم الكامل + اللقب / القبيلة */}
        <div
          onClick={() => {
            if (didDragRef.current) return;
            onSelectPerson(person.id);
          }}
          className="flex items-start gap-2.5 cursor-pointer"
        >
          <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-[#E5E0D5] bg-[#FAF8F4] flex items-center justify-center">
            {avatarSrc ? (
              <img
                src={avatarSrc}
                alt={person.full_name}
                loading="lazy"
                decoding="async"
                draggable={false}
                className="h-full w-full object-cover"
              />
            ) : (
              <User className="h-5 w-5 text-[#78716C]" />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <h3
              className="text-[13px] font-bold leading-snug text-[#1C1917] line-clamp-2 hover:text-[#14532D]"
              title={person.full_name}
            >
              {person.full_name}
            </h3>
            {tribeTitle ? (
              <p className="mt-0.5 truncate text-[11px] font-semibold text-[#92400E]">
                {tribeTitle}
                {nickname && nickname !== tribeTitle ? ` · ${nickname}` : ''}
              </p>
            ) : nickname ? (
              <p className="mt-0.5 truncate text-[11px] font-medium text-[#92400E]">
                {nickname}
              </p>
            ) : null}
          </div>
        </div>

        {/* الصف الأوسط: رقم الجيل + الميلاد/الوفاة + شارة حالة الحياة */}
        <div className="flex items-center justify-between gap-2 text-[11px]">
          <div className="min-w-0 truncate font-mono tabular-nums text-[#57534E]">
            <span>{person.generation ? `ج${person.generation}` : 'سجل'}</span>
            {birthDisplay && <span className="mr-1.5 text-[#78716C]">· م {birthDisplay}</span>}
            {!alive && deathDisplay && (
              <span className="mr-1.5 text-[#991B1B]">· ت {deathDisplay}</span>
            )}
          </div>

          {alive ? (
            <span className="inline-flex shrink-0 items-center gap-1 rounded border border-[#86EFAC] bg-[#DCFCE7] px-1.5 py-0.5 text-[10px] font-semibold text-[#166534]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#16A34A]" />
              <span>حي</span>
            </span>
          ) : (
            <span className="inline-flex shrink-0 items-center rounded border border-[#E7E5E4] bg-[#F5F5F4] px-1.5 py-0.5 text-[10px] font-medium text-[#57534E]">
              متوفى
            </span>
          )}
        </div>

        {/* الصف السفلي: التفاصيل + مشاركة النسب + التعديل والحذف */}
        <div className="flex items-center justify-between gap-2 border-t border-[#F2EFE9] pt-1.5 text-[11px]">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSelectPerson(person.id);
              }}
              className="font-medium text-[#14532D] hover:underline cursor-pointer"
            >
              التفاصيل
            </button>
            {onShareLineageCard && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onShareLineageCard(person);
                }}
                title="مشاركة بطاقة نسبي"
                className="inline-flex items-center gap-0.5 font-medium text-[#0F2350] hover:underline cursor-pointer"
              >
                <Share2 className="h-3 w-3" />
                <span>مشاركة نسبي</span>
              </button>
            )}
          </div>

          {canEdit && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRequestEdit(person);
                }}
                title={isPrivilegedRole(userRole) ? 'تعديل بيانات الفرد' : 'طلب تعديل بيانات الفرد'}
                className="inline-flex items-center gap-0.5 font-medium text-[#92400E] hover:underline cursor-pointer"
              >
                <Edit3 className="h-3 w-3" />
                <span>{isPrivilegedRole(userRole) ? 'تعديل' : 'طلب تعديل'}</span>
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeletePerson(person);
                }}
                title={isPrivilegedRole(userRole) ? 'حذف الفرد' : 'طلب حذف الفرد'}
                className="inline-flex items-center gap-0.5 font-medium text-[#B91C1C] hover:underline cursor-pointer"
              >
                <Trash2 className="h-3 w-3" />
                <span>{isPrivilegedRole(userRole) ? 'حذف' : 'طلب حذف'}</span>
              </button>
            </div>
          )}
        </div>

        {/* زر الطيّ والتوسيع (+ / -) أسفل بطاقة الأب */}
        {hasChildren && (
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onToggleCollapse(person.id);
            }}
            aria-label={isCollapsed ? `توسيع فرع ${person.full_name}` : `طي فرع ${person.full_name}`}
            title={isCollapsed ? `توسيع الأبناء (${totalChildrenCount})` : 'طي الفرع'}
            className={`absolute -bottom-3.5 left-1/2 -translate-x-1/2 inline-flex h-6 min-w-6 items-center justify-center gap-1 rounded-full border px-1.5 text-[11px] font-bold shadow-xs transition-colors cursor-pointer ${
              isCollapsed
                ? 'border-[#14532D] bg-[#14532D] text-white hover:bg-[#166534]'
                : 'border-[#D6CEBE] bg-white text-[#57534E] hover:border-[#14532D] hover:text-[#14532D]'
            }`}
          >
            {isCollapsed ? (
              <>
                <Plus className="h-3 w-3" />
                <span className="font-mono tabular-nums">{totalChildrenCount}</span>
              </>
            ) : (
              <Minus className="h-3 w-3" />
            )}
          </button>
        )}
      </div>
    );
  }
);

TreePersonCard.displayName = 'TreePersonCard';
