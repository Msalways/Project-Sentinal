import { describe, it, expect, vi } from 'vitest';
import { ScenarioParser } from '../../src/tools/scenario-parser';

describe('ScenarioParser', () => {
  describe('fromYaml', () => {
    it('parses target and roles from YAML content', () => {
      const yaml = `
        target: "https://example.com"
        roles:
          - name: admin
            login: {username: admin, password: secret}
      `;

      const manifest = ScenarioParser.fromYaml(yaml);
      expect(manifest.target).toBe('https://example.com');
      expect(manifest.roles).toHaveLength(1);
      expect(manifest.roles[0].name).toBe('admin');
      expect(manifest.roles[0].credentials).toEqual({ username: 'admin', password: 'secret' });
    });

    it('parses minimal YAML with only target and roles', () => {
      const yaml = `
        target: "https://example.com"
        roles:
          - name: default
      `;
      const manifest = ScenarioParser.fromYaml(yaml);
      expect(manifest.target).toBe('https://example.com');
      expect(manifest.roles).toHaveLength(1);
      expect(manifest.roles[0].name).toBe('default');
    });

    it('parses roles without credentials', () => {
      const yaml = `
        target: "https://example.com"
        roles:
          - name: anonymous
      `;
      const manifest = ScenarioParser.fromYaml(yaml);
      expect(manifest.roles[0].credentials).toEqual({});
    });

    it('parses workflows', () => {
      const yaml = `
        target: "https://example.com"
        roles:
          - name: default
        workflows:
          - name: Recorded Session
            test:
              happy:
                - "Login with valid credentials"
              sad:
                - "SQL Injection in login"
      `;
      const manifest = ScenarioParser.fromYaml(yaml);
      expect(manifest.workflows.length).toBeGreaterThanOrEqual(1);
      const recorded = manifest.workflows.find((w) => w.name === 'Recorded Session');
      expect(recorded).toBeDefined();
      expect(recorded!.test.happy).toContain('Login with valid credentials');
      expect(recorded!.test.sad).toContain('SQL Injection in login');
    });

    it('parses workflows with HAR reference', () => {
      const yaml = `
        target: "https://example.com"
        roles:
          - name: default
        workflows:
          - name: Recorded Session
            har: session.har
            test:
              happy: []
              sad: []
      `;
      const manifest = ScenarioParser.fromYaml(yaml);
      const recorded = manifest.workflows.find((w) => w.name === 'Recorded Session');
      expect(recorded).toBeDefined();
      expect(recorded!.har).toBe('session.har');
      expect(recorded!.test.happy).toEqual([]);
    });

    it('ignores comments and empty lines', () => {
      const yaml = `
        # This is a comment
        target: "https://example.com"
        roles:
          - name: test
      `;
      const manifest = ScenarioParser.fromYaml(yaml);
      expect(manifest.target).toBe('https://example.com');
      expect(manifest.roles).toHaveLength(1);
    });

    it('parses single-quoted strings', () => {
      const yaml = `
        target: 'https://example.com'
        roles:
          - name: 'test-role'
      `;
      const manifest = ScenarioParser.fromYaml(yaml);
      expect(manifest.target).toBe('https://example.com');
      expect(manifest.roles[0].name).toBe('test-role');
    });
  });

  describe('fromFile', () => {
    it('reads a file and parses its YAML content', () => {
      const yaml = `target: "https://example.com"\nroles:\n  - name: reader\n`;
      const readSpy = vi.spyOn(require('fs'), 'readFileSync').mockReturnValue(yaml);
      const manifest = ScenarioParser.fromFile('/fake/scenario.yaml');
      expect(manifest.target).toBe('https://example.com');
      expect(manifest.roles[0].name).toBe('reader');
      readSpy.mockRestore();
    });
  });

  describe('fromHar', () => {
    it('generates manifest from HAR file', () => {
      const harData = {
        log: {
          version: '1.2',
          creator: { name: 'test', version: '1.0' },
          entries: [
            { request: { method: 'GET', url: 'https://example.com/api/users', httpVersion: 'HTTP/1.1', headers: [], queryString: [] }, response: { status: 200, statusText: 'OK', httpVersion: 'HTTP/1.1', headers: [], content: { mimeType: 'application/json', text: '[]', size: 2 } }, cache: {}, timings: {} },
          ],
        },
      };
      const readSpy = vi.spyOn(require('fs'), 'readFileSync').mockReturnValue(JSON.stringify(harData));
      const manifest = ScenarioParser.fromHar('/fake/session.har', 'https://example.com');
      expect(manifest.target).toBe('https://example.com');
      expect(manifest.roles).toHaveLength(1);
      expect(manifest.roles[0].name).toBe('default');
      expect(manifest.workflows).toHaveLength(1);
      expect(manifest.workflows[0].name).toBe('Recorded Session');
      expect(manifest.workflows[0].har).toBe('/fake/session.har');
      expect(manifest.workflows[0].test.happy).toContain('GET https://example.com/api/users → 200 OK');
      readSpy.mockRestore();
    });
  });
});
