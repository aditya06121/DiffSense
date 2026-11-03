import { JobResult, JobStatus } from '../repository/types';

export abstract class Job {
  public readonly id: string;
  public readonly name: string;
  public status: JobStatus = 'PENDING';
  public createdAt: Date;

  constructor(name: string, id?: string) {
    this.name = name;
    this.id = id || `${name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`;
    this.createdAt = new Date();
  }

  public abstract execute(): Promise<JobResult>;
}
