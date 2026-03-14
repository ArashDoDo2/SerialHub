import fs from 'fs';
import path from 'path';
import { ScriptRepository, Script } from '../repositories/ScriptRepository.js';
import { ScriptRunRepository } from '../repositories/ScriptRunRepository.js';
import { SerialConnectionManager, connectionEvents } from './SerialConnectionManager.js';
import { logger } from '../config/logger.js';
import { getSocketServer } from '../config/realtime.js';
import { TerminalSessionService } from './TerminalSessionService.js';
import { SerialNodeRepository } from '../repositories/SerialNodeRepository.js';

interface ScriptCommand {
  text: string;
  delayMs?: number;
}

interface ScriptListItem extends Omit<Script, 'commandsJson'> {
  commands: ScriptCommand[];
  lastRun?: string;
}

export class ScriptService {
  private static activeNodes = new Set<number>();

  private scriptRepo = new ScriptRepository();
  private runRepo = new ScriptRunRepository();
  private nodeRepo = new SerialNodeRepository();
  private connMgr = SerialConnectionManager.getInstance();
  private terminalSessionService = new TerminalSessionService();
  private readonly maxLogBytes = 1024 * 1024;
  private readonly inlineLogBytes = 64 * 1024;

  list(): ScriptListItem[] {
    return this.scriptRepo.getAllWithLastRun().map((script) => ({
      ...script,
      commands: this.parseCommands(script.commandsJson),
      lastRun: script.lastRun,
    }));
  }

  listForOwner(ownerUserId: number): ScriptListItem[] {
    return this.scriptRepo.getAllWithLastRunForOwner(ownerUserId).map((script) => ({
      ...script,
      commands: this.parseCommands(script.commandsJson),
      lastRun: script.lastRun,
    }));
  }

  get(id: number): (Omit<Script, 'commandsJson'> & { commands: ScriptCommand[] }) | undefined {
    const script = this.scriptRepo.getById(id);
    if (!script) {
      return undefined;
    }

    return {
      ...script,
      commands: this.parseCommands(script.commandsJson),
    };
  }

  getForOwner(id: number, ownerUserId: number): (Omit<Script, 'commandsJson'> & { commands: ScriptCommand[] }) | undefined {
    const script = this.scriptRepo.getByIdForOwner(id, ownerUserId);
    if (!script) {
      return undefined;
    }

    return {
      ...script,
      commands: this.parseCommands(script.commandsJson),
    };
  }

  create(script: Partial<Script>): Script {
    return this.scriptRepo.create(script);
  }

  update(id: number, script: Partial<Script>): Script | undefined {
    return this.scriptRepo.update(id, script);
  }

  delete(id: number): void {
    this.scriptRepo.delete(id);
  }

  async runScript(scriptId: number, nodeId: number, userId: number): Promise<number> {
    const script = this.scriptRepo.getById(scriptId);
    if (!script) {
      throw new Error('Script not found');
    }
    const node = this.nodeRepo.getById(nodeId);
    if (!node) {
      throw new Error('Node not found');
    }
    if (script.ownerUserId !== node.ownerUserId) {
      throw new Error('Script and node belong to different owners');
    }

    this.terminalSessionService.ensureAvailableForScript(nodeId);
    if (ScriptService.activeNodes.has(nodeId) || this.runRepo.findRunningByNode(nodeId)) {
      throw new Error('A script is already running on this node');
    }

    const commands = this.parseCommands(script.commandsJson);
    const logDir = path.resolve(process.cwd(), 'logs');
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    const run = this.runRepo.create({
      scriptId,
      nodeId,
      runByUserId: userId,
      ownerUserId: script.ownerUserId,
      status: 'running',
      startedAt: new Date().toISOString(),
    });
    const logPath = path.join(logDir, `script-run-${run.id}.log`);
    this.runRepo.update(run.id, { outputFilePath: logPath });
    logger.info({ runId: run.id, scriptId, nodeId, userId }, 'Script run started');

    ScriptService.activeNodes.add(nodeId);

    void this.executeRun(run.id, script, nodeId, commands, logPath);
    return run.id;
  }

  listRuns(scriptId: number) {
    return this.runRepo.listByScript(scriptId);
  }

  listRunsForOwner(scriptId: number, ownerUserId: number) {
    return this.runRepo.listByScriptForOwner(scriptId, ownerUserId);
  }

  listAllRuns() {
    return this.runRepo.listAllDetailed();
  }

  listAllRunsForOwner(ownerUserId: number) {
    return this.runRepo.listAllDetailedForOwner(ownerUserId);
  }

  getRun(id: number) {
    return this.runRepo.getDetailedById(id);
  }

  getRunForOwner(id: number, ownerUserId: number) {
    return this.runRepo.getDetailedByIdForOwner(id, ownerUserId);
  }

  getRunLog(id: number): { run: ReturnType<ScriptRunRepository['getDetailedById']>; output: string } | undefined {
    const run = this.runRepo.getDetailedById(id);
    if (!run) {
      return undefined;
    }

    let output = '';
    if (run.outputFilePath && fs.existsSync(run.outputFilePath)) {
      const stat = fs.statSync(run.outputFilePath);
      const start = Math.max(stat.size - this.inlineLogBytes, 0);
      const buffer = Buffer.alloc(stat.size - start);
      const fd = fs.openSync(run.outputFilePath, 'r');
      try {
        fs.readSync(fd, buffer, 0, buffer.length, start);
        output = buffer.toString('utf-8');
      } finally {
        fs.closeSync(fd);
      }
    }

    return { run, output };
  }

  private async executeRun(
    runId: number,
    script: Script,
    nodeId: number,
    commands: ScriptCommand[],
    logPath: string
  ): Promise<void> {
    const stream = fs.createWriteStream(logPath, { flags: 'a' });
    let logBytes = 0;
    let logTruncated = false;

    const writeLog = (chunk: string) => {
      const buffer = Buffer.from(chunk);
      if (logBytes >= this.maxLogBytes) {
        if (!logTruncated) {
          stream.write('\n[log truncated]\n');
          logTruncated = true;
        }
        return;
      }

      const remaining = this.maxLogBytes - logBytes;
      const slice = buffer.subarray(0, remaining);
      stream.write(slice);
      logBytes += slice.length;

      if (slice.length < buffer.length && !logTruncated) {
        stream.write('\n[log truncated]\n');
        logTruncated = true;
      }
    };

    const room = `script-run:${runId}`;
    const io = getSocketServer();
    const dataHandler = (msg: { nodeId: number; data: Buffer }) => {
      if (msg.nodeId !== nodeId) {
        return;
      }
      const text = msg.data.toString('utf-8');
      writeLog(text);
      io?.to(room).emit('script:output', { scriptRunId: runId, data: text });
    };

    connectionEvents.on('data', dataHandler);

    let timeoutHandle: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => reject(new Error('Script execution timed out')), script.timeoutMs);
    });

    try {
      await Promise.race([
        (async () => {
          await this.connMgr.openConnection(nodeId);
          for (const command of commands) {
            if (!command.text && typeof command.delayMs === 'number') {
              await new Promise((resolve) => setTimeout(resolve, command.delayMs));
              continue;
            }
            writeLog(`> ${command.text}\n`);
            this.connMgr.write(nodeId, command.text + '\r\n');
            await new Promise((resolve) => setTimeout(resolve, command.delayMs ?? script.defaultDelayMs));
          }
        })(),
        timeoutPromise,
      ]);

      this.runRepo.update(runId, { status: 'completed', finishedAt: new Date().toISOString() });
      logger.info({ runId, scriptId: script.id, nodeId }, 'Script run completed');
      io?.to(room).emit('script:status', { scriptRunId: runId, status: 'completed' });
    } catch (error) {
      const status = error instanceof Error && error.message.includes('timed out') ? 'cancelled' : 'failed';
      logger.error({ runId, nodeId, error }, 'Script execution failed');
      this.runRepo.update(runId, { status, finishedAt: new Date().toISOString() });
      io?.to(room).emit('script:status', {
        scriptRunId: runId,
        status,
        error: error instanceof Error ? error.message : 'Script execution failed',
      });
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
      connectionEvents.off('data', dataHandler);
      ScriptService.activeNodes.delete(nodeId);
      if (!this.connMgr.hasSubscribers(nodeId)) {
        this.connMgr.closeConnection(nodeId);
      }
      stream.end();
    }
  }

  private parseCommands(commandsJson: string): ScriptCommand[] {
    const parsed = JSON.parse(commandsJson) as Array<string | { text?: string; command?: string; delayMs?: number }>;
    return parsed
      .map((command) => {
        if (typeof command === 'string') {
          const waitMatch = command.trim().match(/^WAIT\s+(\d+)$/i);
          if (waitMatch) {
            return { text: '', delayMs: Number(waitMatch[1]) };
          }
          return { text: command };
        }

        return {
          text: command.text ?? command.command ?? '',
          delayMs: command.delayMs,
        };
      })
      .map((command) => ({
        text: command.text,
        delayMs: command.delayMs,
      }));
  }
}
