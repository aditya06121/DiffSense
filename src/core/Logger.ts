import * as fs from 'fs';
import * as path from 'path';
import { GitError } from '../repository/types';

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

export class Logger {
  private static instance: Logger;
  private logFilePath: string | null = null;
  private minLevel: LogLevel = LogLevel.INFO;

  private constructor() {}

  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  public setLogFile(filePath: string): void {
    this.logFilePath = filePath;
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  public setLogLevel(level: LogLevel): void {
    this.minLevel = level;
  }

  private formatMessage(level: string, message: string, context?: Record<string, any>): string {
    const timestamp = new Date().toISOString();
    let formatted = `[${timestamp}] [${level.toUpperCase()}] ${message}`;

    if (context && Object.keys(context).length > 0) {
      const formattedContext = Object.entries(context)
        .map(([key, val]) => `${key}=${typeof val === 'object' ? JSON.stringify(val) : val}`)
        .join(' | ');
      formatted += ` (${formattedContext})`;
    }

    return formatted;
  }

  private write(level: LogLevel, levelName: string, message: string, context?: Record<string, any>): void {
    if (level < this.minLevel) {
      return;
    }

    const logLine = this.formatMessage(levelName, message, context);

    if (level === LogLevel.ERROR) {
      console.error(logLine);
    } else if (level === LogLevel.WARN) {
      console.warn(logLine);
    } else {
      console.log(logLine);
    }

    if (this.logFilePath) {
      try {
        fs.appendFileSync(this.logFilePath, logLine + '\n', 'utf-8');
      } catch (err) {
        console.error(`Failed to write log to ${this.logFilePath}:`, err);
      }
    }
  }

  public debug(message: string, context?: Record<string, any>): void {
    this.write(LogLevel.DEBUG, 'DEBUG', message, context);
  }

  public info(message: string, context?: Record<string, any>): void {
    this.write(LogLevel.INFO, 'INFO', message, context);
  }

  public warn(message: string, context?: Record<string, any>): void {
    this.write(LogLevel.WARN, 'WARN', message, context);
  }

  public error(message: string, error?: Error | GitError | unknown, context?: Record<string, any>): void {
    const errContext: Record<string, any> = { ...context };

    if (error instanceof GitError) {
      errContext['gitCommand'] = `${error.command} ${error.args.join(' ')}`;
      errContext['exitCode'] = error.exitCode;
      errContext['stderr'] = error.stderr.trim();
      errContext['stdout'] = error.stdout.trim();
      if (error.repositoryPath) {
        errContext['repositoryPath'] = error.repositoryPath;
      }
    } else if (error instanceof Error) {
      errContext['errorMessage'] = error.message;
      errContext['stack'] = error.stack;
    } else if (error) {
      errContext['rawError'] = String(error);
    }

    this.write(LogLevel.ERROR, 'ERROR', message, errContext);
  }
}
