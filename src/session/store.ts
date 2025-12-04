import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

export interface ProjectConfig {
  path: string;
  alias?: string;
  lastUsed: number;
}

export interface SessionData {
  currentProject: string;
  projects: Record<string, ProjectConfig>;
}

export class SessionStore {
  private dataPath: string;
  private data: SessionData;

  constructor(dataDir?: string) {
    const dir = dataDir || join(homedir(), '.claude-whatsapp');

    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    this.dataPath = join(dir, 'session.json');
    this.data = this.load();
  }

  private load(): SessionData {
    if (existsSync(this.dataPath)) {
      try {
        const raw = readFileSync(this.dataPath, 'utf-8');
        return JSON.parse(raw);
      } catch {
        // Corrupted file, start fresh
      }
    }

    return {
      currentProject: process.cwd(),
      projects: {}
    };
  }

  private save(): void {
    writeFileSync(this.dataPath, JSON.stringify(this.data, null, 2));
  }

  getCurrentProject(): string {
    return this.data.currentProject;
  }

  setCurrentProject(path: string, alias?: string): void {
    this.data.currentProject = path;

    // Add to projects if not already there
    const key = alias || path;
    this.data.projects[key] = {
      path,
      alias,
      lastUsed: Date.now()
    };

    this.save();
  }

  getProjects(): ProjectConfig[] {
    return Object.values(this.data.projects).sort((a, b) => b.lastUsed - a.lastUsed);
  }

  resolveProject(nameOrPath: string): string | null {
    // Check if it's an alias first
    const byAlias = this.data.projects[nameOrPath];
    if (byAlias) {
      return byAlias.path;
    }

    // Check if it's a known path
    for (const project of Object.values(this.data.projects)) {
      if (project.path === nameOrPath) {
        return project.path;
      }
    }

    // Assume it's a new path
    // Expand ~ to home directory
    if (nameOrPath.startsWith('~')) {
      return nameOrPath.replace('~', homedir());
    }

    return nameOrPath;
  }
}
