import React from 'react';
import type { Profile } from '../types/database';
import type { HeritageNode, HeritageTreeLayout } from '../utils/heritageTreeLayout';

interface HeritagePlaqueCanvasProps {
  layout: HeritageTreeLayout;
  profileByPersonId: Map<string, Profile>;
  selectedPersonId: string | null;
  matchedIdSet: Set<string>;
  radarPathIdSet?: Set<string>;
  radarAnchorIds?: {
    personAId: string;
    personBId: string;
    commonAncestorId: string | null;
  } | null;
  didDragRef: React.MutableRefObject<boolean>;
  onSelectPerson: (personId: string) => void;
}

function splitNameLines(fullName: string | null | undefined, maxCharsPerLine: number): [string, string] {
  const clean = (fullName ?? '').trim().replace(/\s+/g, ' ') || 'غير مسمى';
  if (clean.length <= maxCharsPerLine) {
    return [clean, ''];
  }

  const words = clean.split(' ');
  let line1 = '';
  let idx = 0;

  while (idx < words.length) {
    const candidate = line1 ? `${line1} ${words[idx]}` : words[idx];
    if (candidate.length <= maxCharsPerLine || !line1) {
      line1 = candidate;
      idx += 1;
    } else {
      break;
    }
  }

  const rest = words.slice(idx).join(' ');
  if (!rest) return [line1, ''];
  if (rest.length <= maxCharsPerLine + 2) return [line1, rest];

  let line2 = '';
  for (let i = idx; i < words.length; i++) {
    const cand = line2 ? `${line2} ${words[i]}` : words[i];
    if (cand.length <= maxCharsPerLine + 1 || !line2) {
      line2 = cand;
    } else {
      break;
    }
  }
  return [line1, line2];
}

function buildScallopPolygonPoints(cx: number, cy: number, rOuter: number, rInner: number, teeth: number): string {
  const pts: string[] = [];
  const total = teeth * 2;
  for (let i = 0; i < total; i++) {
    const angle = (Math.PI * 2 * i) / total - Math.PI / 2;
    const r = i % 2 === 0 ? rOuter : rInner;
    pts.push(`${(cx + Math.cos(angle) * r).toFixed(1)},${(cy + Math.sin(angle) * r).toFixed(1)}`);
  }
  return pts.join(' ');
}

function buildLeafPath(w: number, h: number): string {
  const hw = w / 2;
  const hh = h / 2;
  return `M ${-hw} 0 C ${-hw * 0.62} ${-hh * 1.12}, ${hw * 0.62} ${-hh * 1.12}, ${hw} 0 C ${hw * 0.62} ${hh * 1.12}, ${-hw * 0.62} ${hh * 1.12}, ${-hw} 0 Z`;
}

export const HeritagePlaqueCanvas: React.FC<HeritagePlaqueCanvasProps> = React.memo(
  ({
    layout,
    profileByPersonId,
    selectedPersonId,
    matchedIdSet,
    radarPathIdSet,
    radarAnchorIds,
    didDragRef,
    onSelectPerson,
  }) => {
    const isRadarActive = Boolean(radarPathIdSet && radarPathIdSet.size > 0);
    const { width, height, centerX, trunkStartY, trunkEndY, founderY, borderInset } = layout;

    const rightMedallionX = Math.min(width - 175, Math.max(centerX + 260, width - 255));
    const leftMedallionX = Math.max(175, Math.min(centerX - 260, 255));
    const medallionY = 148;

    const cornerCoords = [
      { x: borderInset + 36, y: borderInset + 36 },
      { x: width - borderInset - 36, y: borderInset + 36 },
      { x: borderInset + 36, y: height - borderInset - 36 },
      { x: width - borderInset - 36, y: height - borderInset - 36 },
    ];

    const leafShape = buildLeafPath(158, 56);

    return (
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="block select-none"
        role="img"
        aria-label="لوحة شجرة عائلة بني قطيف التراثية"
      >
        <defs>
          {/* خلفية اللوحة الملكية باللون الأزرق النيلي الداكن */}
          <radialGradient id="royalIndigoBg" cx="50%" cy="46%" r="65%">
            <stop offset="0%" stopColor="#16326E" />
            <stop offset="55%" stopColor="#0F2350" />
            <stop offset="100%" stopColor="#091636" />
          </radialGradient>

          {/* تدرج ذهبي معدني فاخر */}
          <linearGradient id="goldLeafGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#F6DF85" />
            <stop offset="45%" stopColor="#D4AF37" />
            <stop offset="100%" stopColor="#B5891B" />
          </linearGradient>

          <linearGradient id="goldTrunkGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#9E7614" />
            <stop offset="30%" stopColor="#E6C762" />
            <stop offset="50%" stopColor="#FFF0A8" />
            <stop offset="75%" stopColor="#D4AF37" />
            <stop offset="100%" stopColor="#8C660D" />
          </linearGradient>

          <radialGradient id="founderIvoryGold" cx="50%" cy="42%" r="60%">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="72%" stopColor="#FAF3DF" />
            <stop offset="100%" stopColor="#EAD69D" />
          </radialGradient>

          <radialGradient id="branchGoldGrad" cx="40%" cy="35%" r="68%">
            <stop offset="0%" stopColor="#FBE89C" />
            <stop offset="58%" stopColor="#D4AF37" />
            <stop offset="100%" stopColor="#A67C13" />
          </radialGradient>

          <linearGradient id="crimsonBandGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#991B1B" />
            <stop offset="50%" stopColor="#7F1D1D" />
            <stop offset="100%" stopColor="#5C1115" />
          </linearGradient>

          <pattern id="arabesqueGrid" width="84" height="84" patternUnits="userSpaceOnUse">
            <circle cx="42" cy="42" r="30" fill="none" stroke="#D4AF37" strokeOpacity="0.06" strokeWidth="1" />
            <path d="M 42 6 L 78 42 L 42 78 L 6 42 Z" fill="none" stroke="#D4AF37" strokeOpacity="0.05" strokeWidth="1" />
          </pattern>

          <filter id="goldShadow" x="-15%" y="-15%" width="130%" height="130%">
            <feDropShadow dx="0" dy="3" stdDeviation="3.5" floodColor="#040B1C" floodOpacity="0.48" />
          </filter>

          <filter id="highlightGlow" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="0" stdDeviation="8" floodColor="#FDE047" floodOpacity="0.95" />
          </filter>

          <filter id="radarGoldGlow" x="-45%" y="-45%" width="190%" height="190%">
            <feGaussianBlur stdDeviation="5.5" result="blur" />
            <feFlood floodColor="#FDE047" floodOpacity="0.95" result="color" />
            <feComposite in="color" in2="blur" operator="in" result="glow" />
            <feMerge>
              <feMergeNode in="glow" />
              <feMergeNode in="glow" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* 1. الخلفية الرئيسية باللون الأزرق النيلي الداكن */}
        <rect x="0" y="0" width={width} height={height} fill="url(#royalIndigoBg)" />
        <rect
          x={borderInset + 18}
          y={borderInset + 18}
          width={width - (borderInset + 18) * 2}
          height={height - (borderInset + 18) * 2}
          fill="url(#arabesqueGrid)"
        />

        {/* 2. الإطار الخارجي المزخرف المزدوج بالذهبي والأحمر القاني (العنابي) */}
        <rect
          x={borderInset}
          y={borderInset}
          width={width - borderInset * 2}
          height={height - borderInset * 2}
          rx="18"
          fill="none"
          stroke="url(#crimsonBandGrad)"
          strokeWidth="18"
        />
        <rect
          x={borderInset - 9}
          y={borderInset - 9}
          width={width - (borderInset - 9) * 2}
          height={height - (borderInset - 9) * 2}
          rx="24"
          fill="none"
          stroke="#D4AF37"
          strokeWidth="4"
        />
        <rect
          x={borderInset + 10}
          y={borderInset + 10}
          width={width - (borderInset + 10) * 2}
          height={height - (borderInset + 10) * 2}
          rx="12"
          fill="none"
          stroke="#F6DF85"
          strokeWidth="2.5"
        />
        <rect
          x={borderInset + 20}
          y={borderInset + 20}
          width={width - (borderInset + 20) * 2}
          height={height - (borderInset + 20) * 2}
          rx="8"
          fill="none"
          stroke="#D4AF37"
          strokeOpacity="0.55"
          strokeWidth="1.2"
          strokeDasharray="10 6"
        />

        {/* زخارف الزوايا الأربع */}
        {cornerCoords.map((pt, idx) => (
          <g key={`corner-${idx}`} transform={`translate(${pt.x}, ${pt.y})`}>
            <polygon
              points={buildScallopPolygonPoints(0, 0, 26, 17, 12)}
              fill="url(#crimsonBandGrad)"
              stroke="#D4AF37"
              strokeWidth="2"
            />
            <circle cx="0" cy="0" r="11" fill="url(#goldLeafGrad)" stroke="#7F1D1D" strokeWidth="1.5" />
            <circle cx="0" cy="0" r="4" fill="#0F2350" />
          </g>
        ))}

        {/* 3. العنوان الأوسط والميداليتان الدائريتان المزخرفتان في أعلى اللوحة */}
        <g>
          {/* شريط زخرفي يربط الميداليتين العلويتين */}
          <path
            d={`M ${leftMedallionX + 86} ${medallionY} Q ${centerX} ${medallionY - 46} ${rightMedallionX - 86} ${medallionY}`}
            fill="none"
            stroke="#D4AF37"
            strokeOpacity="0.45"
            strokeWidth="2.5"
          />

          {/* اللوحة المركزية العليا */}
          <g transform={`translate(${centerX}, 122)`} filter="url(#goldShadow)">
            <rect
              x="-165"
              y="-44"
              width="330"
              height="88"
              rx="44"
              fill="url(#crimsonBandGrad)"
              stroke="#D4AF37"
              strokeWidth="4"
            />
            <rect
              x="-155"
              y="-36"
              width="310"
              height="72"
              rx="36"
              fill="none"
              stroke="#F6DF85"
              strokeWidth="1.5"
            />
            <text
              x="0"
              y="-4"
              textAnchor="middle"
              dominantBaseline="central"
              fill="#FAF3DF"
              fontSize="26"
              fontWeight="700"
              className="font-heritage"
            >
              آل مال الله
            </text>
            <text
              x="0"
              y="22"
              textAnchor="middle"
              dominantBaseline="central"
              fill="#F6DF85"
              fontSize="13"
              fontWeight="600"
            >
              الأرشيف النسبي التراثي الموثق
            </text>
          </g>

          {/* الميدالية اليمنى واليسرى: شجرة عائلة بني قطيف */}
          {[rightMedallionX, leftMedallionX].map((mx, idx) => (
            <g
              key={`top-medallion-${idx}`}
              transform={`translate(${mx}, ${medallionY})`}
              filter="url(#goldShadow)"
            >
              <polygon
                points={buildScallopPolygonPoints(0, 0, 92, 79, 20)}
                fill="url(#goldLeafGrad)"
                stroke="#7F1D1D"
                strokeWidth="2"
              />
              <circle
                cx="0"
                cy="0"
                r="74"
                fill="url(#crimsonBandGrad)"
                stroke="#F6DF85"
                strokeWidth="3"
              />
              <circle
                cx="0"
                cy="0"
                r="65"
                fill="url(#founderIvoryGold)"
                stroke="#D4AF37"
                strokeWidth="2.5"
              />
              <circle
                cx="0"
                cy="0"
                r="58"
                fill="none"
                stroke="#8B1E24"
                strokeOpacity="0.45"
                strokeWidth="1"
                strokeDasharray="4 3"
              />
              <text
                x="0"
                y="-14"
                textAnchor="middle"
                dominantBaseline="central"
                fill="#7F1D1D"
                fontSize="19"
                fontWeight="700"
                className="font-heritage"
              >
                شجرة عائلة
              </text>
              <text
                x="0"
                y="16"
                textAnchor="middle"
                dominantBaseline="central"
                fill="#0F2350"
                fontSize="23"
                fontWeight="800"
                className="font-heritage"
              >
                بني قطيف
              </text>
            </g>
          ))}
        </g>

        {/* 4. الجذع المركزي الصاعد من الجد المؤسس نحو الأعلى */}
        <g>
          {/* تاج أعلى الجذع */}
          <polygon
            points={`${centerX},${trunkEndY - 36} ${centerX - 18},${trunkEndY + 4} ${centerX + 18},${trunkEndY + 4}`}
            fill="url(#goldLeafGrad)"
            stroke="#7F1D1D"
            strokeWidth="1.5"
          />
          {/* عمود الجذع */}
          <rect
            x={centerX - 10}
            y={trunkEndY}
            width="20"
            height={Math.max(40, trunkStartY - trunkEndY + 12)}
            rx="10"
            fill="url(#goldTrunkGrad)"
            stroke="#7F1D1D"
            strokeWidth="1.5"
          />
          {/* جذور متشعبة زخرفية أسفل ميدالية الجد المؤسس */}
          <path
            d={`M ${centerX - 34} ${founderY + 62} Q ${centerX - 80} ${founderY + 106} ${centerX - 150} ${founderY + 114}`}
            fill="none"
            stroke="#D4AF37"
            strokeOpacity="0.7"
            strokeWidth="4.5"
            strokeLinecap="round"
          />
          <path
            d={`M ${centerX + 34} ${founderY + 62} Q ${centerX + 80} ${founderY + 106} ${centerX + 150} ${founderY + 114}`}
            fill="none"
            stroke="#D4AF37"
            strokeOpacity="0.7"
            strokeWidth="4.5"
            strokeLinecap="round"
          />
        </g>

        {/* 5. الأغصان المنحنية الذهبية */}
        <g>
          {layout.edges.map((edge) => {
            const isRadarEdge =
              isRadarActive &&
              radarPathIdSet!.has(edge.childId) &&
              radarPathIdSet!.has(edge.parentId);

            const isHighlighted =
              isRadarEdge ||
              (!isRadarActive &&
                (selectedPersonId === edge.childId ||
                  selectedPersonId === edge.parentId ||
                  matchedIdSet.has(edge.childId)));

            const pathD = edge.isTrunkEdge
              ? `M ${edge.x1} ${edge.y1} L ${edge.x2} ${edge.y2}`
              : `M ${edge.x1} ${edge.y1} C ${edge.cx1} ${edge.cy1}, ${edge.cx2} ${edge.cy2}, ${edge.x2} ${edge.y2}`;

            return (
              <g key={edge.id} filter={isRadarEdge ? 'url(#radarGoldGlow)' : undefined}>
                {isRadarEdge && (
                  <path
                    d={pathD}
                    fill="none"
                    stroke="#FDE047"
                    strokeWidth={edge.strokeWidth + 8}
                    strokeLinecap="round"
                    strokeOpacity={0.5}
                  />
                )}
                <path
                  d={pathD}
                  fill="none"
                  stroke={isRadarEdge ? '#FFFBEB' : isHighlighted ? '#FEF08A' : 'url(#goldLeafGrad)'}
                  strokeWidth={
                    isRadarEdge
                      ? edge.strokeWidth + 3.5
                      : isHighlighted
                        ? edge.strokeWidth + 2
                        : edge.strokeWidth
                  }
                  strokeLinecap="round"
                  strokeOpacity={
                    isRadarActive ? (isRadarEdge ? 1 : 0.14) : isHighlighted ? 1 : 0.88
                  }
                />
              </g>
            );
          })}
        </g>

        {/* 6. المستطيلات الذهبية الزخرفية على الجذع عند التفرع المباشر */}
        {layout.trunkCartouches.map((item) => (
          <g
            key={item.id}
            transform={`translate(${item.x}, ${item.y})`}
            filter="url(#goldShadow)"
          >
            <rect
              x={-item.width / 2}
              y={-item.height / 2}
              width={item.width}
              height={item.height}
              rx="10"
              fill="url(#goldLeafGrad)"
              stroke="#7F1D1D"
              strokeWidth="2.5"
            />
            <rect
              x={-item.width / 2 + 5}
              y={-item.height / 2 + 5}
              width={item.width - 10}
              height={item.height - 10}
              rx="6"
              fill="none"
              stroke="#7F1D1D"
              strokeOpacity="0.5"
              strokeWidth="1"
            />
            <text
              x="0"
              y="-7"
              textAnchor="middle"
              dominantBaseline="central"
              fill="#111827"
              fontSize="13.5"
              fontWeight="800"
            >
              {item.title}
            </text>
            {item.subtitle && (
              <text
                x="0"
                y="12"
                textAnchor="middle"
                dominantBaseline="central"
                fill="#7F1D1D"
                fontSize="11"
                fontWeight="700"
              >
                {item.subtitle}
              </text>
            )}
          </g>
        ))}

        {/* 7. عقد الشجرة: ميدالية المؤسس + مستطيلات الجذع + دوائر رؤساء الفروع + الأوراق الذهبية */}
        {layout.nodes.map((node) => {
          const isInRadarPath = isRadarActive && Boolean(radarPathIdSet?.has(node.id));
          const isRadarAnchor =
            isRadarActive &&
            Boolean(
              radarAnchorIds &&
                (radarAnchorIds.personAId === node.id ||
                  radarAnchorIds.personBId === node.id ||
                  radarAnchorIds.commonAncestorId === node.id)
            );
          const isDimmedByRadar = isRadarActive && !isInRadarPath;

          return (
            <HeritageSvgNode
              key={node.id}
              node={node}
              linkedProfile={profileByPersonId.get(node.id) ?? null}
              isSelected={selectedPersonId === node.id}
              isMatched={matchedIdSet.has(node.id)}
              isRadarHighlighted={isInRadarPath}
              isRadarAnchor={isRadarAnchor}
              isDimmed={isDimmedByRadar}
              leafShape={leafShape}
              didDragRef={didDragRef}
              onSelectPerson={onSelectPerson}
            />
          );
        })}
      </svg>
    );
  }
);

HeritagePlaqueCanvas.displayName = 'HeritagePlaqueCanvas';

interface HeritageSvgNodeProps {
  node: HeritageNode;
  linkedProfile: Profile | null;
  isSelected: boolean;
  isMatched: boolean;
  isRadarHighlighted?: boolean;
  isRadarAnchor?: boolean;
  isDimmed?: boolean;
  leafShape: string;
  didDragRef: React.MutableRefObject<boolean>;
  onSelectPerson: (personId: string) => void;
}

const HeritageSvgNode: React.FC<HeritageSvgNodeProps> = React.memo(
  ({
    node,
    linkedProfile,
    isSelected,
    isMatched,
    isRadarHighlighted = false,
    isRadarAnchor = false,
    isDimmed = false,
    leafShape,
    didDragRef,
    onSelectPerson,
  }) => {
    const { person, kind, x, y, width, height } = node;
    const nickname = person.nickname || linkedProfile?.nickname;
    const tribeTitle = person.tribe_title || person.branch_name || '';
    const subtitleLabel = tribeTitle || nickname || '';
    const birthText = person.birth_date || (person.birth_year ? String(person.birth_year) : '');
    const deathText = person.death_date || (person.death_year ? String(person.death_year) : '');
    const alive = person.is_alive !== false;
    const tooltipText = [
      person.full_name,
      subtitleLabel,
      birthText ? `الميلاد: ${birthText}` : null,
      !alive ? (deathText ? `متوفى (${deathText})` : 'متوفى') : 'على قيد الحياة',
    ]
      .filter(Boolean)
      .join(' · ');
    const highlighted = isSelected || isMatched || isRadarHighlighted;
    const activeFilter = isRadarHighlighted
      ? 'url(#radarGoldGlow)'
      : highlighted
        ? 'url(#highlightGlow)'
        : 'url(#goldShadow)';
    const nodeOpacity = isDimmed ? 0.2 : 1;

    function handleClick(e: React.MouseEvent) {
      e.stopPropagation();
      if (didDragRef.current) return;
      onSelectPerson(person.id);
    }

    if (kind === 'founder-medallion') {
      const [line1, line2] = splitNameLines(person.full_name, 16);
      return (
        <g
          transform={`translate(${x}, ${y})`}
          onClick={handleClick}
          opacity={nodeOpacity}
          className="cursor-pointer group"
          filter={activeFilter}
        >
          <title>{person.full_name}</title>
          <polygon
            points={buildScallopPolygonPoints(0, 0, 84, 72, 22)}
            fill="url(#goldLeafGrad)"
            stroke="#7F1D1D"
            strokeWidth="2.5"
          />
          <circle
            cx="0"
            cy="0"
            r="68"
            fill="url(#founderIvoryGold)"
            stroke="#8B1E24"
            strokeWidth="4"
          />
          <circle
            cx="0"
            cy="0"
            r="60"
            fill="none"
            stroke="#D4AF37"
            strokeWidth="2"
          />
          <text
            x="0"
            y="-30"
            textAnchor="middle"
            dominantBaseline="central"
            fill="#8B1E24"
            fontSize="11.5"
            fontWeight="800"
          >
            {subtitleLabel || 'الجد المؤسس'}
          </text>
          <text
            x="0"
            y={line2 ? -4 : 4}
            textAnchor="middle"
            dominantBaseline="central"
            fill="#0F2350"
            fontSize="16.5"
            fontWeight="800"
            className="font-heritage"
          >
            {line1}
          </text>
          {line2 && (
            <text
              x="0"
              y="18"
              textAnchor="middle"
              dominantBaseline="central"
              fill="#0F2350"
              fontSize="15"
              fontWeight="700"
              className="font-heritage"
            >
              {line2}
            </text>
          )}
          <text
            x="0"
            y="40"
            textAnchor="middle"
            dominantBaseline="central"
            fill="#78350F"
            fontSize="10.5"
            fontWeight="700"
          >
            {person.generation ? `الجيل ${person.generation}` : 'الأصل'}
          </text>
        </g>
      );
    }

    if (kind === 'trunk-rect') {
      const [line1, line2] = splitNameLines(person.full_name, 22);
      return (
        <g
          transform={`translate(${x}, ${y})`}
          onClick={handleClick}
          opacity={nodeOpacity}
          className="cursor-pointer"
          filter={activeFilter}
        >
          <title>{person.full_name}</title>
          <rect
            x={-width / 2}
            y={-height / 2}
            width={width}
            height={height}
            rx="10"
            fill="url(#goldLeafGrad)"
            stroke={highlighted ? '#FFFFFF' : '#7F1D1D'}
            strokeWidth={highlighted ? 3.5 : 2.5}
          />
          <rect
            x={-width / 2 + 5}
            y={-height / 2 + 5}
            width={width - 10}
            height={height - 10}
            rx="6"
            fill="none"
            stroke="#7F1D1D"
            strokeOpacity="0.55"
            strokeWidth="1"
          />
          <text
            x="0"
            y={line2 ? -11 : tribeTitle ? -8 : 0}
            textAnchor="middle"
            dominantBaseline="central"
            fill="#000000"
            fontSize="13.5"
            fontWeight="800"
          >
            {line1}
          </text>
          {line2 && (
            <text
              x="0"
              y={tribeTitle ? 4 : 11}
              textAnchor="middle"
              dominantBaseline="central"
              fill="#1F2937"
              fontSize="11.5"
              fontWeight="700"
            >
              {line2}
            </text>
          )}
          {tribeTitle && (
            <text
              x="0"
              y={line2 ? 18 : 11}
              textAnchor="middle"
              dominantBaseline="central"
              fill="#7F1D1D"
              fontSize="9.5"
              fontWeight="700"
            >
              {tribeTitle.slice(0, 22)}
            </text>
          )}
        </g>
      );
    }

    if (kind === 'branch-circle') {
      const [line1, line2] = splitNameLines(person.full_name, 13);
      return (
        <g
          transform={`translate(${x}, ${y})`}
          onClick={handleClick}
          opacity={nodeOpacity}
          className="cursor-pointer"
          filter={activeFilter}
        >
          <title>{person.full_name}</title>
          <polygon
            points={buildScallopPolygonPoints(0, 0, width / 2 + 4, width / 2 - 4, 16)}
            fill="url(#goldLeafGrad)"
            stroke="#7F1D1D"
            strokeWidth="1.8"
          />
          <circle
            cx="0"
            cy="0"
            r={width / 2 - 6}
            fill="url(#branchGoldGrad)"
            stroke={highlighted ? '#FFFFFF' : '#7F1D1D'}
            strokeWidth={highlighted ? 3 : 2}
          />
          <circle
            cx="0"
            cy="0"
            r={width / 2 - 12}
            fill="none"
            stroke="#FEF08A"
            strokeOpacity="0.85"
            strokeWidth="1"
          />
          <text
            x="0"
            y={line2 ? -9 : -2}
            textAnchor="middle"
            dominantBaseline="central"
            fill="#000000"
            fontSize="12.5"
            fontWeight="800"
          >
            {line1}
          </text>
          {line2 && (
            <text
              x="0"
              y="9"
              textAnchor="middle"
              dominantBaseline="central"
              fill="#111827"
              fontSize="11"
              fontWeight="700"
            >
              {line2}
            </text>
          )}
          {subtitleLabel && (
            <text
              x="0"
              y="26"
              textAnchor="middle"
              dominantBaseline="central"
              fill="#7F1D1D"
              fontSize="9.5"
              fontWeight="700"
            >
              {subtitleLabel.slice(0, 14)}
            </text>
          )}
        </g>
      );
    }

    // ورقة شجر ذهبية مدببة (#D4AF37) بخط أسود واضح وأنيق
    const [leafLine1, leafLine2] = splitNameLines(person.full_name, 16);
    return (
      <g
        transform={`translate(${x}, ${y})`}
        onClick={handleClick}
        opacity={nodeOpacity}
        className="cursor-pointer"
        filter={activeFilter}
      >
        <title>{tooltipText}</title>
        <path
          d={leafShape}
          fill={isRadarAnchor ? '#FEF08A' : highlighted ? '#FDE047' : 'url(#goldLeafGrad)'}
          stroke={isRadarAnchor ? '#FFFFFF' : highlighted ? '#FFFFFF' : '#7F1D1D'}
          strokeWidth={isRadarAnchor ? 3.4 : highlighted ? 2.8 : 1.7}
        />
        {/* عرق الورقة الداخلي الخفيف */}
        <path
          d={`M ${-width / 2 + 12} 0 Q 0 -3 ${width / 2 - 12} 0`}
          fill="none"
          stroke="#92400E"
          strokeOpacity="0.22"
          strokeWidth="1"
        />
        {/* مؤشر حالة الحياة */}
        <circle
          cx={width / 2 - 17}
          cy="0"
          r="3.2"
          fill={alive ? '#15803D' : '#44403C'}
          stroke="#FEF9C3"
          strokeWidth="0.9"
        />
        <text
          x="-2"
          y={leafLine2 ? (tribeTitle ? -12 : -7) : tribeTitle ? -7 : 0}
          textAnchor="middle"
          dominantBaseline="central"
          fill="#000000"
          fontSize={leafLine2 && tribeTitle ? '11' : '12'}
          fontWeight="800"
        >
          {leafLine1}
        </text>
        {leafLine2 && (
          <text
            x="-2"
            y={tribeTitle ? 1 : 9}
            textAnchor="middle"
            dominantBaseline="central"
            fill="#111827"
            fontSize={tribeTitle ? '9.8' : '10.5'}
            fontWeight="700"
          >
            {leafLine2}
          </text>
        )}
        {tribeTitle && (
          <text
            x="-2"
            y={leafLine2 ? 14 : 10}
            textAnchor="middle"
            dominantBaseline="central"
            fill="#7F1D1D"
            fontSize="8.8"
            fontWeight="700"
          >
            {tribeTitle.slice(0, 18)}
          </text>
        )}
      </g>
    );
  }
);

HeritageSvgNode.displayName = 'HeritageSvgNode';
