export function readingTime(body: string): string {
  const words = body.trim().split(/\s+/).length;
  const mins = Math.ceil(words / 200);
  return `${mins} min read`;
}
