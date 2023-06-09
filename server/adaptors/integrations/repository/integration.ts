export class Integration {
  directory: string;

  constructor(directory: string) {
    this.directory = directory;
  }

  async check(): Promise<boolean> {
    return true;
  }
}
