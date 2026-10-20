// Preserve the SDK exception structure so PostHog can render the original
// message, complete stack, causes, source context and diagnostic properties.
export function exceptionProperties(input: unknown): Record<string, any> {
  const properties = input && typeof input === 'object' ? input : {};
  return { ...properties, $process_person_profile: false };
}
