import type { Finding, Severity } from './types';

export type NodeKind =
  | 'host' | 'service' | 'endpoint' | 'entrypoint' | 'parameter'
  | 'finding' | 'vulnerability' | 'credential' | 'session'
  | 'technology' | 'auth_method' | 'crown_jewel' | 'sink' | 'source';

export type EdgeKind =
  | 'calls' | 'auth' | 'dataflow' | 'depends_on'
  | 'leads_to' | 'contains' | 'uses' | 'trusts'
  | 'exploits' | 'bypasses' | 'exposes';

export interface GraphNode {
  id: string;
  kind: NodeKind;
  label: string;
  properties: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface GraphEdge {
  from: string;
  to: string;
  kind: EdgeKind;
  label: string;
  properties: Record<string, unknown>;
  weight: number;
  createdAt: string;
}

export class KnowledgeGraph {
  private nodes: Map<string, GraphNode> = new Map();
  private edges: GraphEdge[] = [];
  private adjacency: Map<string, Set<string>> = new Map();

  addNode(id: string, kind: NodeKind, label: string, properties: Record<string, unknown> = {}): GraphNode {
    const now = new Date().toISOString();
    const existing = this.nodes.get(id);
    if (existing) {
      existing.properties = { ...existing.properties, ...properties };
      existing.updatedAt = now;
      return existing;
    }
    const node: GraphNode = { id, kind, label, properties, createdAt: now, updatedAt: now };
    this.nodes.set(id, node);
    this.adjacency.set(id, new Set());
    return node;
  }

  getNode(id: string): GraphNode | undefined {
    return this.nodes.get(id);
  }

  findNodes(kind: NodeKind): GraphNode[] {
    const results: GraphNode[] = [];
    for (const node of this.nodes.values()) {
      if (node.kind === kind) results.push(node);
    }
    return results;
  }

  findNodesByProperty(kind: NodeKind, key: string, value: unknown): GraphNode[] {
    const results: GraphNode[] = [];
    for (const node of this.nodes.values()) {
      if (node.kind === kind && node.properties[key] === value) results.push(node);
    }
    return results;
  }

  searchNodes(query: string): GraphNode[] {
    const q = query.toLowerCase();
    const results: GraphNode[] = [];
    for (const node of this.nodes.values()) {
      if (node.label.toLowerCase().includes(q) ||
          node.id.toLowerCase().includes(q) ||
          JSON.stringify(node.properties).toLowerCase().includes(q)) {
        results.push(node);
      }
    }
    return results;
  }

  addEdge(fromId: string, toId: string, kind: EdgeKind, label: string, weight: number = 1, properties: Record<string, unknown> = {}): GraphEdge | null {
    if (!this.nodes.has(fromId) || !this.nodes.has(toId)) return null;
    const edge: GraphEdge = { from: fromId, to: toId, kind, label, weight, properties, createdAt: new Date().toISOString() };
    this.edges.push(edge);
    this.adjacency.get(fromId)?.add(toId);
    return edge;
  }

  getEdges(fromId: string): GraphEdge[] {
    return this.edges.filter((e) => e.from === fromId);
  }

  getIncomingEdges(toId: string): GraphEdge[] {
    return this.edges.filter((e) => e.to === toId);
  }

  findPath(fromId: string, toId: string): string[] | null {
    const visited = new Set<string>();
    const queue: Array<{ node: string; path: string[] }> = [{ node: fromId, path: [fromId] }];
    while (queue.length > 0) {
      const { node, path } = queue.shift()!;
      if (node === toId) return path;
      if (visited.has(node)) continue;
      visited.add(node);
      const neighbors = this.adjacency.get(node);
      if (neighbors) {
        for (const neighbor of neighbors) {
          if (!visited.has(neighbor)) queue.push({ node: neighbor, path: [...path, neighbor] });
        }
      }
    }
    return null;
  }

  findAttackPaths(fromKinds: NodeKind[], toKinds: NodeKind[], maxDepth: number = 5): Array<{ path: string[]; score: number }> {
    const results: Array<{ path: string[]; score: number }> = [];
    const entrypoints = this.findNodesByKinds(fromKinds);
    const targets = this.findNodesByKinds(toKinds);

    for (const entry of entrypoints) {
      for (const target of targets) {
        const path = this.shortestWeightedPath(entry.id, target.id, maxDepth);
        if (path) {
          const score = this.pathRiskScore(path);
          results.push({ path, score });
        }
      }
    }
    return results.sort((a, b) => b.score - a.score);
  }

  importFinding(finding: Finding): void {
    const findingId = `finding:${finding.id}`;
    this.addNode(findingId, 'finding', finding.title, {
      severity: finding.severity,
      category: finding.category,
      confidence: finding.confidence,
      location: finding.location,
      description: finding.description,
      remediation: finding.remediation,
    });

    const locationId = `endpoint:${finding.location}`;
    this.addNode(locationId, 'endpoint', finding.location, { url: finding.location });
    this.addEdge(findingId, locationId, 'exploits', `${finding.category} at ${finding.location}`, 1);
  }

  toJSON(): { nodes: GraphNode[]; edges: GraphEdge[] } {
    return { nodes: Array.from(this.nodes.values()), edges: this.edges };
  }

  nodeCount(): number { return this.nodes.size; }
  edgeCount(): number { return this.edges.length; }

  getSummary(): string {
    const kinds = new Map<NodeKind, number>();
    for (const node of this.nodes.values()) {
      kinds.set(node.kind, (kinds.get(node.kind) || 0) + 1);
    }
    const kindSummary = Array.from(kinds.entries())
      .map(([k, c]) => `${k}:${c}`).join(', ');
    return `Graph: ${this.nodes.size} nodes, ${this.edges.length} edges [${kindSummary}]`;
  }

  private findNodesByKinds(kinds: NodeKind[]): GraphNode[] {
    const results: GraphNode[] = [];
    for (const node of this.nodes.values()) {
      if (kinds.includes(node.kind)) results.push(node);
    }
    return results;
  }

  private shortestWeightedPath(fromId: string, toId: string, maxDepth: number): string[] | null {
    const visited = new Set<string>();
    const queue: Array<{ node: string; path: string[]; cost: number }> = [{ node: fromId, path: [fromId], cost: 0 }];
    while (queue.length > 0) {
      const { node, path, cost } = queue.shift()!;
      if (node === toId) return path;
      if (visited.has(node) || path.length > maxDepth) continue;
      visited.add(node);
      const edges = this.edges.filter((e) => e.from === node);
      for (const edge of edges) {
        if (!visited.has(edge.to)) {
          queue.push({ node: edge.to, path: [...path, edge.to], cost: cost + edge.weight });
        }
      }
      queue.sort((a, b) => a.cost - b.cost);
    }
    return null;
  }

  private pathRiskScore(path: string[]): number {
    let score = 0;
    for (const nodeId of path) {
      const node = this.nodes.get(nodeId);
      if (!node) continue;
      if (node.kind === 'finding') {
        const sev = (node.properties.severity as string) || 'info';
        if (sev === 'critical') score += 40;
        else if (sev === 'high') score += 25;
        else if (sev === 'medium') score += 15;
        else score += 5;
      }
      if (node.kind === 'credential') score += 20;
      if (node.kind === 'vulnerability') score += 30;
      if (node.kind === 'crown_jewel') score += 50;
    }
    return score;
  }
}
