import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SessionStore } from './store.js';
import { mkdtempSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir, homedir } from 'os';

describe('SessionStore', () => {
  let tempDir: string;
  let store: SessionStore;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'claude-ping-test-'));
    store = new SessionStore(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('initialization', () => {
    it('should create session file directory', () => {
      expect(existsSync(tempDir)).toBe(true);
    });

    it('should default to current working directory', () => {
      const project = store.getCurrentProject();
      expect(project).toBe(process.cwd());
    });
  });

  describe('getCurrentProject / setCurrentProject', () => {
    it('should set and get current project', () => {
      store.setCurrentProject('/path/to/project');
      expect(store.getCurrentProject()).toBe('/path/to/project');
    });

    it('should persist project across instances', () => {
      store.setCurrentProject('/path/to/project');

      const newStore = new SessionStore(tempDir);
      expect(newStore.getCurrentProject()).toBe('/path/to/project');
    });
  });

  describe('getProjects', () => {
    it('should return empty array initially', () => {
      expect(store.getProjects()).toEqual([]);
    });

    it('should return projects after setting them', () => {
      store.setCurrentProject('/path/one');
      store.setCurrentProject('/path/two');

      const projects = store.getProjects();
      expect(projects.length).toBe(2);
    });

    it('should sort projects by lastUsed (most recent first)', async () => {
      store.setCurrentProject('/path/one');
      // Small delay to ensure different timestamps
      await new Promise((resolve) => setTimeout(resolve, 10));
      store.setCurrentProject('/path/two');

      const projects = store.getProjects();
      expect(projects[0].path).toBe('/path/two');
      expect(projects[1].path).toBe('/path/one');
    });

    it('should include aliases when set', () => {
      store.setCurrentProject('/path/to/project', 'myproject');

      const projects = store.getProjects();
      expect(projects[0].alias).toBe('myproject');
    });
  });

  describe('resolveProject', () => {
    it('should resolve by alias', () => {
      store.setCurrentProject('/path/to/project', 'myproj');

      const resolved = store.resolveProject('myproj');
      expect(resolved).toBe('/path/to/project');
    });

    it('should resolve by known path', () => {
      store.setCurrentProject('/path/to/project');

      const resolved = store.resolveProject('/path/to/project');
      expect(resolved).toBe('/path/to/project');
    });

    it('should expand ~ to home directory', () => {
      const resolved = store.resolveProject('~/myproject');
      expect(resolved).toBe(join(homedir(), 'myproject'));
    });

    it('should return new paths as-is', () => {
      const resolved = store.resolveProject('/new/path');
      expect(resolved).toBe('/new/path');
    });
  });
});
