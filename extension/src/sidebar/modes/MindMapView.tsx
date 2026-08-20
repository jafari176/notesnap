import { useMemo, useState } from 'react';
import type { ModeViewProps } from './shared/modeRegistry';
import { seekVideoTo } from '../../content/youtube-player';

// Strict hierarchy (video -> sections -> subsections), not an arbitrary
// graph, so a hand-rolled SVG layout is enough — no need for a full
// graph-physics library per the plan's guidance.

interface LayoutNode {
  id: string;
  label: string;
  t_s?: number;
  x: number;
  y: number;
  children: LayoutNode[];
}

const NODE_WIDTH = 96;
const NODE_HEIGHT = 28;
const H_GAP = 24;
const V_GAP = 44;

function buildLayout(content: ModeViewProps['content']): { root: LayoutNode; width: number; height: number } {
  let leafIndex = 0;
  const countLeaves = (n: number): number => Math.max(1, n);

  function layoutSection(title: string, t_s: number | undefined, subs: { title: string; start_s?: number }[], depth: number): LayoutNode {
    if (subs.length === 0) {
      const node: LayoutNode = { id: `leaf-${leafIndex}`, label: title, t_s, x: leafIndex * (NODE_WIDTH + H_GAP), y: depth * (NODE_HEIGHT + V_GAP), children: [] };
      leafIndex += 1;
      return node;
    }
    const children = subs.map((s) => layoutSection(s.title, s.start_s, [], depth + 1));
    const x = children.length > 0 ? (children[0].x + children[children.length - 1].x) / 2 : leafIndex * (NODE_WIDTH + H_GAP);
    return { id: `node-${title}`, label: title, t_s, x, y: depth * (NODE_HEIGHT + V_GAP), children };
  }

  const sectionNodes = content.sections.map((s) => layoutSection(s.title, s.start_s, s.subsections, 1));
  const rootX = sectionNodes.length > 0 ? (sectionNodes[0].x + sectionNodes[sectionNodes.length - 1].x) / 2 : 0;
  const root: LayoutNode = {
    id: 'root',
    label: content.video.title || 'Video',
    x: rootX,
    y: 0,
    children: sectionNodes,
  };

  const maxX = Math.max(...flatten(root).map((n) => n.x)) + NODE_WIDTH;
  const maxY = Math.max(...flatten(root).map((n) => n.y)) + NODE_HEIGHT;
  countLeaves(leafIndex);
  return { root, width: maxX + 20, height: maxY + 20 };
}

function flatten(node: LayoutNode): LayoutNode[] {
  return [node, ...node.children.flatMap(flatten)];
}

export function MindMapView({ content }: ModeViewProps) {
  const { root, width, height } = useMemo(() => buildLayout(content), [content]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  function toggleCollapse(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function visibleNodesAndEdges(): { nodes: LayoutNode[]; edges: Array<[LayoutNode, LayoutNode]> } {
    const visibleNodes: LayoutNode[] = [];
    const visibleEdges: Array<[LayoutNode, LayoutNode]> = [];
    const walk = (node: LayoutNode) => {
      visibleNodes.push(node);
      if (collapsed.has(node.id)) return; // don't descend past a collapsed node
      for (const child of node.children) {
        visibleEdges.push([node, child]);
        walk(child);
      }
    };
    walk(root);
    return { nodes: visibleNodes, edges: visibleEdges };
  }

  const { nodes, edges } = visibleNodesAndEdges();

  return (
    <div className="notesnap-mindmap-container">
      <svg width={Math.max(width, 300)} height={Math.max(height, 200)} className="notesnap-mindmap-svg">
        {edges.map(([from, to]) => (
          <line
            key={`${from.id}-${to.id}`}
            x1={from.x + NODE_WIDTH / 2}
            y1={from.y + NODE_HEIGHT}
            x2={to.x + NODE_WIDTH / 2}
            y2={to.y}
            stroke="#3a3d4d"
            strokeWidth={1}
          />
        ))}
        {nodes.map((node) => (
          <g
            key={node.id}
            transform={`translate(${node.x}, ${node.y})`}
            onClick={() => (node.t_s !== undefined ? seekVideoTo(node.t_s) : node.children.length > 0 && toggleCollapse(node.id))}
            style={{ cursor: 'pointer' }}
          >
            <title>{node.t_s !== undefined ? `${node.label} (click to jump)` : node.label}</title>
            <rect
              width={NODE_WIDTH}
              height={NODE_HEIGHT}
              rx={4}
              fill={node.id === 'root' ? '#7c3aed' : '#2c2f3d'}
              stroke="#3a3d4d"
            />
            <text x={NODE_WIDTH / 2} y={NODE_HEIGHT / 2 + 4} textAnchor="middle" fontSize={10} fill="#f2f2f5">
              {node.label.length > 14 ? `${node.label.slice(0, 13)}…` : node.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
