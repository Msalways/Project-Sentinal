import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PlaywrightTestGenerator } from '../../src/tools/test-generator';
import type { ScenarioManifest } from '../../src/tools/scenario-parser';

function makeManifest(overrides: Partial<ScenarioManifest> = {}): ScenarioManifest {
  return {
    target: 'https://example.com',
    roles: [
      { name: 'admin', credentials: { username: 'admin', password: 'secret' } },
      { name: 'user', credentials: { email: 'user@test.com', password: 'pass123' } },
    ],
    workflows: [
      {
        name: 'User Login',
        test: {
          happy: ['Login with valid credentials'],
          sad: ['SQL Injection in login', 'Brute force attack on login'],
        },
      },
    ],
    ...overrides,
  };
}

describe('PlaywrightTestGenerator', () => {
  let generator: PlaywrightTestGenerator;

  beforeEach(() => {
    generator = new PlaywrightTestGenerator('https://example.com');
  });

  describe('constructor', () => {
    it('stores the target URL', () => {
      const g = new PlaywrightTestGenerator('https://test.com');
      expect((g as any).target).toBe('https://test.com');
    });
  });

  describe('generateFromManifest', () => {
    it('creates output directory and generates files', () => {
      const fs = require('fs');
      const mkdirSpy = vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined);
      const writeSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);

      const manifest = makeManifest();
      const files = generator.generateFromManifest(manifest, '/tmp/test-output');

      expect(mkdirSpy).toHaveBeenCalled();
      expect(files.length).toBeGreaterThanOrEqual(3);
      expect(files.some((f) => f.endsWith('user-login.spec.ts'))).toBe(true);
      expect(files.some((f) => f.endsWith('user-login-security.spec.ts'))).toBe(true);
      expect(files.some((f) => f.replace(/\\/g, '/').endsWith('fixtures/auth.ts'))).toBe(true);

      mkdirSpy.mockRestore();
      writeSpy.mockRestore();
    });

    it('generates only happy path if no sad tests', () => {
      const fs = require('fs');
      const mkdirSpy = vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined);
      const writeSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);

      const manifest = makeManifest({
        workflows: [{ name: 'Browse Products', test: { happy: ['Browse product catalog'], sad: [] } }],
      });
      const files = generator.generateFromManifest(manifest, '/tmp/test-output');

      expect(files.some((f) => f.endsWith('browse-products.spec.ts'))).toBe(true);
      expect(files.some((f) => f.endsWith('browse-products-security.spec.ts'))).toBe(false);

      mkdirSpy.mockRestore();
      writeSpy.mockRestore();
    });
  });

  describe('happy path generation', () => {
    it('generates login step for login-related steps', () => {
      const fs = require('fs');
      const writeSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);
      const mkdirSpy = vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined);

      const manifest = makeManifest({
        workflows: [{ name: 'Login', test: { happy: ['Login with valid credentials'], sad: [] } }],
      });
      generator.generateFromManifest(manifest, '/tmp/out');
      const content = writeSpy.mock.calls.find((c: any) => (c[0] as string).endsWith('login.spec.ts'))?.[1] as string;
      expect(content).toContain("await page.fill('#email'");
      expect(content).toContain("await page.fill('#password'");

      mkdirSpy.mockRestore();
      writeSpy.mockRestore();
    });

    it('generates browse step for product-related steps', () => {
      const fs = require('fs');
      const writeSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);
      const mkdirSpy = vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined);

      const manifest = makeManifest({
        workflows: [{ name: 'Shop', test: { happy: ['Browse product catalog'], sad: [] } }],
      });
      generator.generateFromManifest(manifest, '/tmp/out');
      const content = writeSpy.mock.calls.find((c: any) => (c[0] as string).endsWith('shop.spec.ts'))?.[1] as string;
      expect(content).toContain('.product-list');
      expect(content).toContain('toBeVisible');

      mkdirSpy.mockRestore();
      writeSpy.mockRestore();
    });

    it('generates checkout step for payment-related steps', () => {
      const fs = require('fs');
      const writeSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);
      const mkdirSpy = vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined);

      const manifest = makeManifest({
        workflows: [{ name: 'Buy', test: { happy: ['Checkout and payment'], sad: [] } }],
      });
      generator.generateFromManifest(manifest, '/tmp/out');
      const content = writeSpy.mock.calls.find((c: any) => (c[0] as string).endsWith('buy.spec.ts'))?.[1] as string;
      expect(content).toContain('card-number');
      expect(content).toContain('order-confirmation');

      mkdirSpy.mockRestore();
      writeSpy.mockRestore();
    });

    it('generates admin step for admin-related steps', () => {
      const fs = require('fs');
      const writeSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);
      const mkdirSpy = vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined);

      const manifest = makeManifest({
        workflows: [{ name: 'Admin', test: { happy: ['Access admin dashboard'], sad: [] } }],
      });
      generator.generateFromManifest(manifest, '/tmp/out');
      const content = writeSpy.mock.calls.find((c: any) => (c[0] as string).endsWith('admin.spec.ts'))?.[1] as string;
      expect(content).toContain('/admin');

      mkdirSpy.mockRestore();
      writeSpy.mockRestore();
    });

    it('parses HTTP method+URL steps using request API', () => {
      const fs = require('fs');
      const writeSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);
      const mkdirSpy = vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined);

      const manifest = makeManifest({
        workflows: [{ name: 'API', test: { happy: ['GET https://example.com/api/users'], sad: [] } }],
      });
      generator.generateFromManifest(manifest, '/tmp/out');
      const content = writeSpy.mock.calls.find((c: any) => (c[0] as string).endsWith('api.spec.ts'))?.[1] as string;
      expect(content).toContain('page.request.get');

      mkdirSpy.mockRestore();
      writeSpy.mockRestore();
    });

    it('generates TODO placeholder for unrecognized steps', () => {
      const fs = require('fs');
      const writeSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);
      const mkdirSpy = vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined);

      const manifest = makeManifest({
        workflows: [{ name: 'Custom', test: { happy: ['Do something custom'], sad: [] } }],
      });
      generator.generateFromManifest(manifest, '/tmp/out');
      const content = writeSpy.mock.calls.find((c: any) => (c[0] as string).endsWith('custom.spec.ts'))?.[1] as string;
      expect(content).toContain('TODO');

      mkdirSpy.mockRestore();
      writeSpy.mockRestore();
    });
  });

  describe('security test generation', () => {
    it('generates SQL injection test code', () => {
      const fs = require('fs');
      const writeSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);
      const mkdirSpy = vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined);

      const manifest = makeManifest({
        workflows: [{ name: 'Login', test: { happy: ['login'], sad: ['SQL Injection in login'] } }],
      });
      generator.generateFromManifest(manifest, '/tmp/out');
      const content = writeSpy.mock.calls.find((c: any) => (c[0] as string).endsWith('login-security.spec.ts'))?.[1] as string;
      expect(content).toContain("' OR 1=1--");
      expect(content).toContain(".error");

      mkdirSpy.mockRestore();
      writeSpy.mockRestore();
    });

    it('generates XSS test code', () => {
      const fs = require('fs');
      const writeSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);
      const mkdirSpy = vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined);

      const manifest = makeManifest({
        workflows: [{ name: 'Search', test: { happy: ['search'], sad: ['XSS in search input'] } }],
      });
      generator.generateFromManifest(manifest, '/tmp/out');
      const content = writeSpy.mock.calls.find((c: any) => (c[0] as string).endsWith('search-security.spec.ts'))?.[1] as string;
      expect(content).toContain("<script>alert");

      mkdirSpy.mockRestore();
      writeSpy.mockRestore();
    });

    it('generates brute force test code', () => {
      const fs = require('fs');
      const writeSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);
      const mkdirSpy = vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined);

      const manifest = makeManifest({
        workflows: [{ name: 'Auth', test: { happy: ['login'], sad: ['Brute force rate limit test'] } }],
      });
      generator.generateFromManifest(manifest, '/tmp/out');
      const content = writeSpy.mock.calls.find((c: any) => (c[0] as string).endsWith('auth-security.spec.ts'))?.[1] as string;
      expect(content).toContain('for (let i = 0; i < 10; i++)');
      expect(content).toContain('.rate-limit');

      mkdirSpy.mockRestore();
      writeSpy.mockRestore();
    });

    it('generates IDOR test code', () => {
      const fs = require('fs');
      const writeSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);
      const mkdirSpy = vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined);

      const manifest = makeManifest({
        workflows: [{ name: 'Users', test: { happy: ['view'], sad: ['IDOR other user data'] } }],
      });
      generator.generateFromManifest(manifest, '/tmp/out');
      const content = writeSpy.mock.calls.find((c: any) => (c[0] as string).endsWith('users-security.spec.ts'))?.[1] as string;
      expect(content).toContain('/users/2');
      expect(content).toContain('toBe(403)');

      mkdirSpy.mockRestore();
      writeSpy.mockRestore();
    });

    it('generates auth bypass test code', () => {
      const fs = require('fs');
      const writeSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);
      const mkdirSpy = vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined);

      const manifest = makeManifest({
        workflows: [{ name: 'Admin', test: { happy: ['view'], sad: ['Auth bypass to admin panel'] } }],
      });
      generator.generateFromManifest(manifest, '/tmp/out');
      const content = writeSpy.mock.calls.find((c: any) => (c[0] as string).endsWith('admin-security.spec.ts'))?.[1] as string;
      expect(content).toContain('/admin');
      expect(content).toContain('unauthorized');

      mkdirSpy.mockRestore();
      writeSpy.mockRestore();
    });

    it('generates tampered price test code', () => {
      const fs = require('fs');
      const writeSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);
      const mkdirSpy = vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined);

      const manifest = makeManifest({
        workflows: [{ name: 'Cart', test: { happy: ['buy'], sad: ['Tampered price in checkout'] } }],
      });
      generator.generateFromManifest(manifest, '/tmp/out');
      const content = writeSpy.mock.calls.find((c: any) => (c[0] as string).endsWith('cart-security.spec.ts'))?.[1] as string;
      expect(content).toContain('price: 0.01');
      expect(content).toContain('toBe(400)');

      mkdirSpy.mockRestore();
      writeSpy.mockRestore();
    });

    it('generates TODO placeholder for unrecognized sad steps', () => {
      const fs = require('fs');
      const writeSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);
      const mkdirSpy = vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined);

      const manifest = makeManifest({
        workflows: [{ name: 'Misc', test: { happy: ['ok'], sad: ['Some unknown attack'] } }],
      });
      generator.generateFromManifest(manifest, '/tmp/out');
      const content = writeSpy.mock.calls.find((c: any) => (c[0] as string).endsWith('misc-security.spec.ts'))?.[1] as string;
      expect(content).toContain('TODO');

      mkdirSpy.mockRestore();
      writeSpy.mockRestore();
    });
  });

  describe('auth fixture generation', () => {
    it('generates fixture with roles from manifest', () => {
      const fs = require('fs');
      const writeSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);
      const mkdirSpy = vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined);

      const manifest = makeManifest();
      generator.generateFromManifest(manifest, '/tmp/out');
      const content = writeSpy.mock.calls.find((c: any) => (c[0] as string).replace(/\\/g, '/').endsWith('fixtures/auth.ts'))?.[1] as string;
      expect(content).toContain('admin');
      expect(content).toContain('user');
      expect(content).toContain('loginAs');
      expect(content).toContain('getAuthToken');

      mkdirSpy.mockRestore();
      writeSpy.mockRestore();
    });
  });
});
