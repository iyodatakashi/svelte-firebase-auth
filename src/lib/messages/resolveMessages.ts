import type { AuthMessages, AuthMessagesOverride } from '$lib/models/auth/auth.types';
import { jaMessages } from './ja';

/** 指定された項目だけを差し替える。指定のない項目は基準の文言を用いる */
export const resolveMessages = (
	overrides?: AuthMessagesOverride,
	base: AuthMessages = jaMessages
): AuthMessages => {
	if (!overrides) {
		return base;
	}
	const { errors, ...rest } = overrides;
	return {
		...base,
		...definedOnly(rest),
		errors: { ...base.errors, ...definedOnly(errors ?? {}) }
	};
};

/** 明示的に undefined を渡した項目で基準を消さない */
const definedOnly = <T extends object>(source: T): Partial<T> =>
	Object.fromEntries(
		Object.entries(source).filter(([, value]) => value !== undefined)
	) as Partial<T>;
