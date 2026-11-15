import type { FamilyPerson } from '../types/database';
import type { TreeNodeData } from './kinship';

export type HeritageNodeKind =
  | 'founder-medallion'
  | 'trunk-rect'
  | 'branch-circle'
  | 'leaf';

export interface HeritageNode {
  id: string;
  person: FamilyPerson;
  kind: HeritageNodeKind;
  side: -1 | 0 | 1; // -1 يسار، 0 الجذع الأوسط، +1 يمين
  x: number; // مركز العنصر X
  y: number; // مركز العنصر Y
  width: number;
  height: number;
  depth: number;
  childrenCount: number;
}

export interface HeritageTrunkCartouche {
  id: string;
  title: string;
  subtitle?: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface HeritageEdge {
  id: string;
  parentId: string;
  childId: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  cx1: number;
  cy1: number;
  cx2: number;
  cy2: number;
  strokeWidth: number;
  isTrunkEdge?: boolean;
}

export interface HeritageTreeLayout {
  nodes: HeritageNode[];
  edges: HeritageEdge[];
  trunkCartouches: HeritageTrunkCartouche[];
  nodeMap: Map<string, HeritageNode>;
  width: number;
  height: number;
  centerX: number;
  trunkStartY: number;
  trunkEndY: number;
  founderY: number;
  headerHeight: number;
  borderInset: number;
}

const LEAF_W = 158;
const LEAF_H = 56;
const CIRCLE_D = 94; // قطر الدائرة الذهبية لرؤساء الفروع
const TRUNK_RECT_W = 204;
const TRUNK_RECT_H = 54;
const FOUNDER_D = 152; // قطر ميدالية الجد المؤسس

const WING_COL_STEP = 192; // المسافة الأفقية بين الأجيال (> LEAF_W لمنع أي تداخل أفقي)
const WING_LEAF_V_SLOT = 66; // المسافة العمودية المضمونة لكل ورقة
const WING_BRANCH_GAP = 32; // فاصل عمودي بين الفروع الرئيسية على نفس الجانب
const ARCH_LIFT_PER_DEPTH = 26; // تقوس طبيعي لطيف نحو الأعلى مع تفرع الأجيال

const HEADER_ZONE_H = 290;
const BOTTOM_ZONE_H = 190;
const SIDE_PADDING = 140;

interface MeasuredWingSubtree {
  tree: TreeNodeData;
  kind: HeritageNodeKind;
  slotHeight: number;
  totalNodes: number;
  children: MeasuredWingSubtree[];
}

function countTreeNodes(node: TreeNodeData): number {
  let count = 1;
  for (const child of node.children) {
    count += countTreeNodes(child);
  }
  return count;
}

function measureWingSubtree(
  node: TreeNodeData,
  wingDepth: number
): MeasuredWingSubtree {
  const isBranchHead =
    wingDepth === 0 || (wingDepth === 1 && node.children.length > 0);
  const kind: HeritageNodeKind = isBranchHead ? 'branch-circle' : 'leaf';
  const baseHeight = kind === 'branch-circle' ? CIRCLE_D + 16 : LEAF_LEAF_SLOT(kind);

  const measuredChildren = node.children.map((child) =>
    measureWingSubtree(child, wingDepth + 1)
  );

  if (measuredChildren.length === 0) {
    return {
      tree: node,
      kind,
      slotHeight: baseHeight,
      totalNodes: 1,
      children: [],
    };
  }

  const childrenHeight =
    measuredChildren.reduce((sum, ch) => sum + ch.slotHeight, 0) +
    Math.max(0, measuredChildren.length - 1) * 6;

  return {
    tree: node,
    kind,
    slotHeight: Math.max(baseHeight, childrenHeight),
    totalNodes:
      1 + measuredChildren.reduce((sum, ch) => sum + ch.totalNodes, 0),
    children: measuredChildren,
  };
}

function LEAF_LEAF_SLOT(kind: HeritageNodeKind): number {
  return kind === 'branch-circle' ? CIRCLE_D + 16 : LEAF_LEAF_HEIGHT;
}

const LEAF_LEAF_HEIGHT = WING_LEAF_V_SLOT;

function getMaxWingDepth(sub: MeasuredWingSubtree, depth = 1): number {
  if (sub.children.length === 0) return depth;
  let maxD = depth;
  for (const c of sub.children) {
    const d = getMaxWingDepth(c, depth + 1);
    if (d > maxD) maxD = d;
  }
  return maxD;
}

/**
 * حساب تخطيط لوحة الشجرة التراثية المزخرفة:
 * - الجد المؤسس في الأسفل داخل ميدالية دائرية كبيرة
 * - جذع مستقيم يصعد للأعلى حاملاً تسلسل الآباء الرئيسيين في مستطيلات ذهبية متراصة
 * - أغصان منحنية يميناً ويساراً تتفرع إلى دوائر رؤساء الأفخاذ وأوراق شجر ذهبية مدببة بدون أي تداخل
 */
export function computeHeritageTreeLayout(
  forest: TreeNodeData[]
): HeritageTreeLayout {
  if (forest.length === 0) {
    return {
      nodes: [],
      edges: [],
      trunkCartouches: [],
      nodeMap: new Map(),
      width: 1200,
      height: 900,
      centerX: 600,
      trunkStartY: 700,
      trunkEndY: 300,
      founderY: 720,
      headerHeight: HEADER_ZONE_H,
      borderInset: 26,
    };
  }

  // اختيار الجذر الأكبر كشجرة رئيسية، وضم أي جذور منفصلة أخرى تحت التوزيع المتوازن
  const sortedRoots = [...forest].sort(
    (a, b) => countTreeNodes(b) - countTreeNodes(a)
  );
  const primaryRoot = sortedRoots[0];
  const extraRoots = sortedRoots.slice(1);

  // استخلاص سلسلة الجذع المباشرة (إن وُجد آباء وحيدون قبل أول تفرع)
  const spineNodes: TreeNodeData[] = [];
  let branchingNode: TreeNodeData = primaryRoot;
  while (
    branchingNode.children.length === 1 &&
    spineNodes.length < 4
  ) {
    spineNodes.push(branchingNode);
    branchingNode = branchingNode.children[0];
  }
  // الجد المؤسس دائماً هو primaryRoot (أو أول عقدة في السلسلة)، والبقية مستطيلات على الجذع
  const founderTree = primaryRoot;
  const trunkAncestors =
    spineNodes.length > 0 ? [...spineNodes.slice(1), branchingNode] : [];

  // الفروع المتفرعة من نقطة التفرع (زائد أي جذور إضافية مستقلة إن وجدت)
  const rawBranches: TreeNodeData[] =
    spineNodes.length > 0
      ? [...branchingNode.children, ...extraRoots]
      : [...primaryRoot.children, ...extraRoots];

  const branchParentId =
    spineNodes.length > 0 ? branchingNode.person.id : founderTree.person.id;

  // قياس كل فرع وتوزيع الفروع بتوازن بين الجناح الأيمن (+1) والأيسر (-1)
  const measuredBranches = rawBranches.map((b) => measureWingSubtree(b, 0));

  const rightBranches: MeasuredWingSubtree[] = [];
  const leftBranches: MeasuredWingSubtree[] = [];
  let rightWeight = 0;
  let leftWeight = 0;

  // ترتيب تنازلي ثم توزيع متوازن لضمان تماثل اللوحة
  const weighted = [...measuredBranches].sort(
    (a, b) => b.totalNodes - a.totalNodes
  );
  for (const br of weighted) {
    if (rightWeight <= leftWeight) {
      rightBranches.push(br);
      rightWeight += br.slotHeight;
    } else {
      leftBranches.push(br);
      leftWeight += br.slotHeight;
    }
  }

  const rightMaxDepth = rightBranches.reduce(
    (m, b) => Math.max(m, getMaxWingDepth(b, 1)),
    0
  );
  const leftMaxDepth = leftBranches.reduce(
    (m, b) => Math.max(m, getMaxWingDepth(b, 1)),
    0
  );

  const trunkGapHalf = TRUNK_RECT_W / 2 + 86;
  const rightWingSpan =
    rightBranches.length > 0
      ? trunkGapHalf + (rightMaxDepth - 1) * WING_COL_STEP + LEAF_W / 2 + 40
      : 320;
  const leftWingSpan =
    leftBranches.length > 0
      ? trunkGapHalf + (leftMaxDepth - 1) * WING_COL_STEP + LEAF_W / 2 + 40
      : 320;

  const rightHeight =
    rightBranches.reduce((s, b) => s + b.slotHeight, 0) +
    Math.max(0, rightBranches.length - 1) * WING_BRANCH_GAP;
  const leftHeight =
    leftBranches.reduce((s, b) => s + b.slotHeight, 0) +
    Math.max(0, leftBranches.length - 1) * WING_BRANCH_GAP;

  const trunkStackCount =
    trunkAncestors.length > 0
      ? trunkAncestors.length
      : rawBranches.length > 0
        ? 3
        : 0;
  const minTrunkHeight = trunkStackCount * (TRUNK_RECT_H + 34) + 120;

  const maxDepthOverall = Math.max(rightMaxDepth, leftMaxDepth, 1);
  const crownLiftAllowance = maxDepthOverall * ARCH_LIFT_PER_DEPTH + 40;
  const canopyHeight = Math.max(rightHeight, leftHeight, minTrunkHeight, 440);

  const width = Math.max(
    1440,
    SIDE_PADDING * 2 + leftWingSpan + rightWingSpan
  );
  const centerX = SIDE_PADDING + leftWingSpan;

  const canopyTopY = HEADER_ZONE_H + crownLiftAllowance;
  const canopyBottomY = canopyTopY + canopyHeight;
  const founderY = canopyBottomY + 90;
  const height = founderY + BOTTOM_ZONE_H;

  const nodes: HeritageNode[] = [];
  const edges: HeritageEdge[] = [];
  const trunkCartouches: HeritageTrunkCartouche[] = [];
  const nodeMap = new Map<string, HeritageNode>();

  // 1. وضع ميدالية الجد المؤسس في الأسفل
  const founderNode: HeritageNode = {
    id: founderTree.person.id,
    person: founderTree.person,
    kind: 'founder-medallion',
    side: 0,
    x: centerX,
    y: founderY,
    width: FOUNDER_D,
    height: FOUNDER_D,
    depth: 0,
    childrenCount: founderTree.children.length,
  };
  nodes.push(founderNode);
  nodeMap.set(founderNode.id, founderNode);

  // 2. رسم الجذع المركزي الصاعد للأعلى مع تسلسل الآباء أو اللوحات الذهبية المتراصة
  const trunkStartY = founderY - FOUNDER_D / 2;
  const trunkEndY = canopyTopY + 34;

  if (trunkAncestors.length > 0) {
    const stepY =
      (trunkStartY - 70 - trunkEndY) / Math.max(1, trunkAncestors.length);
    let prevNode = founderNode;

    trunkAncestors.forEach((anc, idx) => {
      const y = trunkStartY - 64 - idx * stepY;
      const trunkNode: HeritageNode = {
        id: anc.person.id,
        person: anc.person,
        kind: 'trunk-rect',
        side: 0,
        x: centerX,
        y,
        width: TRUNK_RECT_W,
        height: TRUNK_RECT_H,
        depth: idx + 1,
        childrenCount: anc.children.length,
      };
      nodes.push(trunkNode);
      nodeMap.set(trunkNode.id, trunkNode);

      edges.push({
        id: `trunk-${prevNode.id}->${trunkNode.id}`,
        parentId: prevNode.id,
        childId: trunkNode.id,
        x1: centerX,
        y1: prevNode.y - prevNode.height / 2,
        x2: centerX,
        y2: trunkNode.y + trunkNode.height / 2,
        cx1: centerX,
        cy1: (prevNode.y + trunkNode.y) / 2,
        cx2: centerX,
        cy2: (prevNode.y + trunkNode.y) / 2,
        strokeWidth: 8,
        isTrunkEdge: true,
      });

      prevNode = trunkNode;
    });
  } else if (rawBranches.length > 0) {
    // عندما يتفرع الجد المؤسس مباشرة إلى فروع: نضع مستطيلات ذهبية تراثية متراصة على الجذع
    const labels = [
      { title: 'عمود النسب المبارك', subtitle: 'سلالة الجد المؤسس' },
      { title: 'تفرّع البطون والأفخاذ', subtitle: `${rawBranches.length} فروع رئيسية` },
      { title: 'شجرة آل مال الله', subtitle: 'عشيرة بني قطيف' },
    ];
    const availSpan = Math.max(180, trunkStartY - trunkEndY - 90);
    const step = availSpan / labels.length;
    labels.forEach((item, idx) => {
      trunkCartouches.push({
        id: `cartouche-${idx}`,
        title: item.title,
        subtitle: item.subtitle,
        x: centerX,
        y: trunkStartY - 68 - idx * step,
        width: TRUNK_RECT_W,
        height: TRUNK_RECT_H,
      });
    });
  }

  // 3. توزيع الفروع والأوراق على الجانبين الأيمن والأيسر بدون أي تداخل
  function placeWingSubtree(
    sub: MeasuredWingSubtree,
    side: -1 | 1,
    slotTopY: number,
    wingDepth: number,
    parentAnchor: { id: string; x: number; y: number }
  ) {
    const x = centerX + side * (trunkGapHalf + wingDepth * WING_COL_STEP);
    const rawCenterY = slotTopY + sub.slotHeight / 2;
    const archLift = wingDepth * ARCH_LIFT_PER_DEPTH;
    const y = rawCenterY - archLift;

    const width = sub.kind === 'branch-circle' ? CIRCLE_D : LEAF_W;
    const height = sub.kind === 'branch-circle' ? CIRCLE_D : LEAF_H;

    const hNode: HeritageNode = {
      id: sub.tree.person.id,
      person: sub.tree.person,
      kind: sub.kind,
      side,
      x,
      y,
      width,
      height,
      depth: wingDepth + 1,
      childrenCount: sub.children.length,
    };
    nodes.push(hNode);
    nodeMap.set(hNode.id, hNode);

    const startX =
      parentAnchor.x === centerX
        ? centerX
        : parentAnchor.x + side * (wingDepth === 1 ? CIRCLE_D / 2 : LEAF_W / 2 - 12);
    const endX = x - side * (width / 2 - 6);
    const dx = Math.abs(endX - startX);

    edges.push({
      id: `bough-${parentAnchor.id}->${hNode.id}`,
      parentId: parentAnchor.id,
      childId: hNode.id,
      x1: startX,
      y1: parentAnchor.y,
      x2: endX,
      y2: y,
      cx1: startX + side * dx * 0.45,
      cy1: parentAnchor.y - 12,
      cx2: endX - side * dx * 0.42,
      cy2: y + 8,
      strokeWidth:
        wingDepth === 0 ? 5.2 : wingDepth === 1 ? 3.5 : wingDepth === 2 ? 2.4 : 1.7,
    });

    if (sub.children.length > 0) {
      const totalChHeight =
        sub.children.reduce((s, ch) => s + ch.slotHeight, 0) +
        Math.max(0, sub.children.length - 1) * 6;
      let cursorY = rawCenterY - totalChHeight / 2;

      for (const child of sub.children) {
        placeWingSubtree(child, side, cursorY, wingDepth + 1, {
          id: hNode.id,
          x,
          y,
        });
        cursorY += child.slotHeight + 6;
      }
    }
  }

  function layoutWing(branches: MeasuredWingSubtree[], wingH: number, side: -1 | 1) {
    if (branches.length === 0) return;
    // توسيط الفروع عمودياً داخل الارتفاع الكلي للشجرة
    let cursorY = canopyTopY + (canopyHeight - wingH) / 2;
    const totalB = branches.length;

    branches.forEach((br, idx) => {
      // نقاط ارتكاز متدرجة على الجذع المركزي من الأسفل للأعلى
      const ratio = totalB === 1 ? 0.5 : idx / (totalB - 1);
      const trunkAnchorY =
        trunkStartY - 85 - (1 - ratio) * Math.max(120, trunkStartY - trunkEndY - 140);

      placeWingSubtree(br, side, cursorY, 0, {
        id: branchParentId,
        x: centerX,
        y: trunkAnchorY,
      });

      cursorY += br.slotHeight + WING_BRANCH_GAP;
    });
  }

  layoutWing(rightBranches, rightHeight, 1);
  layoutWing(leftBranches, leftHeight, -1);

  return {
    nodes,
    edges,
    trunkCartouches,
    nodeMap,
    width,
    height,
    centerX,
    trunkStartY,
    trunkEndY,
    founderY,
    headerHeight: HEADER_ZONE_H,
    borderInset: 26,
  };
}
