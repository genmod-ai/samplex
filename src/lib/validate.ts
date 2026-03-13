const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

export function validateSlug(slug: string): string | null {
  if (slug.length < 3) return "Slug must be at least 3 characters";
  if (slug.length > 48) return "Slug must be at most 48 characters";
  if (!SLUG_RE.test(slug)) {
    return "Slug must contain only lowercase letters, numbers, and hyphens, and cannot start or end with a hyphen";
  }
  if (slug.includes("--")) {
    return 'Slug cannot contain consecutive hyphens ("--" is used as a separator)';
  }
  return null;
}
