export class PromptBuilder {
  constructor(private readonly defaultPrompt: string, private readonly projectContext?: string) {}

  build(): string {
    const parts = [this.defaultPrompt, this.projectContext].filter(Boolean);
    return parts.join("\n\n");
  }
}
