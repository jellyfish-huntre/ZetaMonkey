import {
  RegExpMatcher,
  englishDataset,
  englishRecommendedTransformers,
} from 'obscenity';

const usernameMatcher = new RegExpMatcher({
  ...englishDataset.build(),
  ...englishRecommendedTransformers,
});

export const USERNAME_MAX_LENGTH = 30;

export function getUsernameValidationError(username: string): string | null {
  const trimmedUsername = username.trim();

  if (!trimmedUsername) {
    return 'Username is required.';
  }

  if (trimmedUsername.length > USERNAME_MAX_LENGTH) {
    return `Username must be ${USERNAME_MAX_LENGTH} characters or fewer.`;
  }

  if (usernameMatcher.hasMatch(trimmedUsername)) {
    return 'That username contains restricted language. Please choose another.';
  }

  return null;
}

export function sanitizeUsernameForDisplay(username: string): string {
  const matches = usernameMatcher.getAllMatches(username, true);

  if (matches.length === 0) {
    return username;
  }

  let sanitized = username;

  // Remove from right to left so each match's original indexes remain valid.
  for (const match of [...matches].reverse()) {
    sanitized =
      sanitized.slice(0, match.startIndex) +
      sanitized.slice(match.endIndex + 1);
  }

  const cleaned = sanitized
    .replace(/([_.-])\1+/g, '$1')
    .trim();

  return /[\p{L}\p{N}]/u.test(cleaned) ? cleaned : 'Player';
}
