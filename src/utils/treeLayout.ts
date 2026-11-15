import type { FamilyPerson } from '../types/database';
import type { TreeNodeData } from './kinship';

export const TREE_CARD_WIDTH = 248;
export const TREE_CARD_HEIGHT = 148;
export const TREE_H_GAP = 28;
export const TREE_V_GAP = 66;
export const TREE_FOREST_GAP = 64;
export const TREE_PADDING = 80;

export interface LayoutNode {
  person: FamilyPerson;
  x: number;
  y: number;
  depth: number;
  totalChildrenCount: number;
  isCollapsed: boolean;
}

export interface LayoutEdge {
  id: string;
  parentId: string;
  childId: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  midY: number;
}

export interface TreeLayoutResult {
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  nodeMap: Map<string, LayoutNode>;
  width: number;
  height: number;
  rootIds: string[];
}

interface MeasuredNode {
  data: TreeNodeData;
  visibleChildren: MeasuredNode[];
  subtreeWidth: number;
  isCollapsed: boolean;
}

/**
 * حساب التخطيط الهرمي الذكي بدون أي تداخل للبطاقات مهما بلغ عدد الأسماء (200+ فرد)
 */
export function computeSmartTreeLayout(
  forest: TreeNodeData[],
  collapsedIds: Set<string>
): TreeLayoutResult {
  if (forest.length === 0) {
    return {
      nodes: [],
      edges: [],
      nodeMap: new Map(),
      width: 0,
      height: 0,
      rootIds: [],
    };
  }

  // 1. حساب عرض كل شجرة فرعية من الأسفل للأعلى
  function measure(node: TreeNodeData): MeasuredNode {
    const isCollapsed = collapsedIds.has(node.person.id);
    const visibleChildren = isCollapsed ? [] : node.children.map(measure);

    if (visibleChildren.length === 0) {
      return {
        data: node,
        visibleChildren: [],
        subtreeWidth: TREE_CARD_WIDTH,
        isCollapsed,
      };
    }

    const childrenWidth =
      visibleChildren.reduce((sum, child) => sum + child.subtreeWidth, 0) +
      (visibleChildren.length - 1) * TREE_H_GAP;

    return {
      data: node,
      visibleChildren,
      subtreeWidth: Math.max(TREE_CARD_WIDTH, childrenWidth),
      isCollapsed,
    };
  }

  const measuredRoots = forest.map(measure);
  const totalForestWidth =
    measuredRoots.reduce((sum, r) => sum + r.subtreeWidth, 0) +
    (measuredRoots.length - 1) * TREE_FOREST_GAP;

  const nodes: LayoutNode[] = [];
  const edges: LayoutEdge[] = [];
  const nodeMap = new Map<string, LayoutNode>();
  let maxBottom = 0;

  // 2. توزيع الإحداثيات من الأعلى للأسفل بترتيب عربي (من اليمين لليسار للأبناء)
  function place(measured: MeasuredNode, spanLeftX: number, depth: number): LayoutNode {
    const x = spanLeftX + (measured.subtreeWidth - TREE_CARD_WIDTH) / 2;
    const y = TREE_PADDING + depth * (TREE_CARD_HEIGHT + TREE_V_GAP);

    const layoutNode: LayoutNode = {
      person: measured.data.person,
      x,
      y,
      depth,
      totalChildrenCount: measured.data.children.length,
      isCollapsed: measured.isCollapsed,
    };

    nodes.push(layoutNode);
    nodeMap.set(layoutNode.person.id, layoutNode);
    if (y + TREE_CARD_HEIGHT > maxBottom) {
      maxBottom = y + TREE_CARD_HEIGHT;
    }

    if (measured.visibleChildren.length > 0) {
      const childrenTotalWidth =
        measured.visibleChildren.reduce((sum, child) => sum + child.subtreeWidth, 0) +
        (measured.visibleChildren.length - 1) * TREE_H_GAP;

      // وضع الابن الأكبر جهة اليمين والانتقال نحو اليسار (توافقاً مع الاتجاه العربي RTL)
      let cursorRight =
        spanLeftX + measured.subtreeWidth - Math.max(0, (measured.subtreeWidth - childrenTotalWidth) / 2);

      const parentBottomX = x + TREE_CARD_WIDTH / 2;
      const parentBottomY = y + TREE_CARD_HEIGHT;
      const midY = parentBottomY + TREE_V_GAP / 2;

      for (const child of measured.visibleChildren) {
        const childSpanLeft = cursorRight - child.subtreeWidth;
        const childLayout = place(child, childSpanLeft, depth + 1);
        cursorRight = childSpanLeft - TREE_H_GAP;

        edges.push({
          id: `${layoutNode.person.id}->${childLayout.person.id}`,
          parentId: layoutNode.person.id,
          childId: childLayout.person.id,
          x1: parentBottomX,
          y1: parentBottomY,
          x2: childLayout.x + TREE_CARD_WIDTH / 2,
          y2: childLayout.y,
          midY,
        });
      }
    }

    return layoutNode;
  }

  // ترتيب الجذور من اليمين إلى اليسار أيضاً
  let rootCursorRight = TREE_PADDING + totalForestWidth;
  for (const root of measuredRoots) {
    const rootLeft = rootCursorRight - root.subtreeWidth;
    place(root, rootLeft, 0);
    rootCursorRight = rootLeft - TREE_FOREST_GAP;
  }

  return {
    nodes,
    edges,
    nodeMap,
    width: totalForestWidth + TREE_PADDING * 2,
    height: Math.max(maxBottom + TREE_PADDING, 420),
    rootIds: forest.map((r) => r.person.id),
  };
}
