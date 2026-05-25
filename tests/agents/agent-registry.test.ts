import { describe, it, expect } from 'vitest';
import { AgentRegistry } from '../../src/agents/agent-registry';
import type { AgentRegistryEntry } from '../../src/agents/agent-registry';

describe('AgentRegistry', () => {
  it('registers and retrieves an agent by name', () => {
    const registry = new AgentRegistry();
    const entry: AgentRegistryEntry = {
      name: 'test-agent',
      description: 'A test agent',
      systemPrompt: 'You are a test agent',
      suggestedTools: ['tool1'],
      tags: ['test'],
    };
    registry.register(entry);
    expect(registry.get('test-agent')).toBe(entry);
  });

  it('returns undefined for an unregistered agent', () => {
    const registry = new AgentRegistry();
    expect(registry.get('nonexistent')).toBeUndefined();
  });

  it('lists all registered agent names', () => {
    const registry = new AgentRegistry();
    registry.register({ name: 'agent-a', description: 'A', systemPrompt: 'P', suggestedTools: [], tags: [] });
    registry.register({ name: 'agent-b', description: 'B', systemPrompt: 'P', suggestedTools: [], tags: [] });
    expect(registry.listNames()).toEqual(['agent-a', 'agent-b']);
  });

  it('returns all registered entries via getAll()', () => {
    const registry = new AgentRegistry();
    registry.register({ name: 'a', description: 'A', systemPrompt: 'P', suggestedTools: [], tags: ['web'] });
    registry.register({ name: 'b', description: 'B', systemPrompt: 'P', suggestedTools: [], tags: ['api'] });
    expect(registry.getAll()).toHaveLength(2);
    expect(registry.getAll().map((e) => e.name)).toEqual(expect.arrayContaining(['a', 'b']));
  });

  it('checks existence with has()', () => {
    const registry = new AgentRegistry();
    registry.register({ name: 'exists', description: 'X', systemPrompt: 'P', suggestedTools: [], tags: [] });
    expect(registry.has('exists')).toBe(true);
    expect(registry.has('missing')).toBe(false);
  });

  it('finds agents matching any of the given tags via getByTags()', () => {
    const registry = new AgentRegistry();
    registry.register({ name: 'web-agent', description: 'W', systemPrompt: 'P', suggestedTools: [], tags: ['web', 'injection'] });
    registry.register({ name: 'api-agent', description: 'A', systemPrompt: 'P', suggestedTools: [], tags: ['api', 'graphql'] });
    registry.register({ name: 'net-agent', description: 'N', systemPrompt: 'P', suggestedTools: [], tags: ['network'] });

    const found = registry.getByTags(['web', 'api']);
    expect(found).toHaveLength(2);
    expect(found.map((e) => e.name)).toEqual(expect.arrayContaining(['web-agent', 'api-agent']));
  });

  it('returns empty array when no tags match', () => {
    const registry = new AgentRegistry();
    registry.register({ name: 'a', description: 'A', systemPrompt: 'P', suggestedTools: [], tags: ['web'] });
    expect(registry.getByTags(['database'])).toHaveLength(0);
  });

  it('resolves tools by name, skipping unknown names', () => {
    const registry = new AgentRegistry();
    const tools = [
      { name: 'http_request', run: () => 'ok' },
      { name: 'port_scan', run: () => 'ok' },
    ];
    const resolved = registry.resolveTools(tools, ['http_request', 'port_scan', 'unknown_tool']);
    expect(resolved).toHaveLength(2);
    expect(resolved[0].name).toBe('http_request');
    expect(resolved[1].name).toBe('port_scan');
  });

  it('returns empty array when no tools resolve', () => {
    const registry = new AgentRegistry();
    expect(registry.resolveTools([], ['missing'])).toHaveLength(0);
  });

  it('overwrites existing agent on re-registration', () => {
    const registry = new AgentRegistry();
    registry.register({ name: 'agent', description: 'original', systemPrompt: 'P', suggestedTools: [], tags: [] });
    registry.register({ name: 'agent', description: 'updated', systemPrompt: 'Q', suggestedTools: [], tags: [] });
    expect(registry.get('agent')!.description).toBe('updated');
  });
});
