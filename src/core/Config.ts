import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import * as dotenv from 'dotenv';
import { EngineConfig, RepositoriesConfigMap, RepositoryConfig } from '../repository/types';

dotenv.config();

export class ConfigLoader {
  private static instance: ConfigLoader;
  private config: EngineConfig | null = null;

  private constructor() {}

  public static getInstance(): ConfigLoader {
    if (!ConfigLoader.instance) {
      ConfigLoader.instance = new ConfigLoader();
    }
    return ConfigLoader.instance;
  }

  public loadConfig(customConfigPath?: string): EngineConfig {
    const rootDir = process.cwd();
    const configPath = customConfigPath || path.join(rootDir, 'src', 'config', 'repositories.yaml');
    const workspaceDir = path.resolve(rootDir, process.env.WORKSPACE_DIR || 'workspace');

    if (!fs.existsSync(configPath)) {
      throw new Error(`Repository configuration file not found at: ${configPath}`);
    }

    const fileContents = fs.readFileSync(configPath, 'utf8');
    const parsedYaml = yaml.load(fileContents) as RepositoriesConfigMap;

    if (!parsedYaml || !parsedYaml.repositories || typeof parsedYaml.repositories !== 'object') {
      throw new Error(`Invalid repositories.yaml format at ${configPath}. Expected 'repositories' root map.`);
    }

    const repositories: Record<string, RepositoryConfig> = {};

    for (const [repoId, repoConfig] of Object.entries(parsedYaml.repositories)) {
      if (!repoConfig || !repoConfig.ssh) {
        throw new Error(`Repository '${repoId}' is missing required 'ssh' URL in configuration.`);
      }
      repositories[repoId] = {
        ssh: repoConfig.ssh,
        defaultBranch: repoConfig.defaultBranch || 'main',
      };
    }

    this.config = {
      workspaceDir,
      configPath,
      sshKeyPath: process.env.SSH_KEY_PATH,
      strictHostKeyChecking: process.env.SSH_STRICT_HOST_KEY_CHECKING || 'accept-new',
      geminiApiKey: process.env.GEMINI_API_KEY,
      aiModel: process.env.AI_MODEL || 'gemini-3.6-flash',
      maxAgentIterations: parseInt(process.env.MAX_AGENT_ITERATIONS || '15', 10),
      agentCommandTimeoutMs: parseInt(process.env.AGENT_COMMAND_TIMEOUT_MS || '60000', 10),
      repositories,
    };

    return this.config;
  }

  public getConfig(): EngineConfig {
    if (!this.config) {
      return this.loadConfig();
    }
    return this.config;
  }

  public getRepositoryConfig(repoId: string): RepositoryConfig {
    const cfg = this.getConfig();
    const repoCfg = cfg.repositories[repoId];
    if (!repoCfg) {
      throw new Error(`Repository ID '${repoId}' not found in configuration.`);
    }
    return repoCfg;
  }

  public addRepository(id: string, config: RepositoryConfig): void {
    const cfg = this.getConfig();
    cfg.repositories[id] = {
      ssh: config.ssh,
      defaultBranch: config.defaultBranch || 'main',
    };
    this.saveConfig();
  }

  public updateRepository(id: string, updates: Partial<RepositoryConfig>): void {
    const cfg = this.getConfig();
    if (!cfg.repositories[id]) {
      throw new Error(`Repository '${id}' does not exist.`);
    }
    if (updates.ssh !== undefined) {
      cfg.repositories[id].ssh = updates.ssh;
    }
    if (updates.defaultBranch !== undefined) {
      cfg.repositories[id].defaultBranch = updates.defaultBranch;
    }
    this.saveConfig();
  }

  public deleteRepository(id: string): void {
    const cfg = this.getConfig();
    if (!cfg.repositories[id]) {
      throw new Error(`Repository '${id}' does not exist.`);
    }
    delete cfg.repositories[id];
    this.saveConfig();
  }

  public saveConfig(): void {
    const cfg = this.getConfig();
    const yamlData: RepositoriesConfigMap = {
      repositories: cfg.repositories,
    };
    const yamlString = yaml.dump(yamlData, { indent: 2 });
    fs.writeFileSync(cfg.configPath, yamlString, 'utf8');
  }
}
