import { describe, expect, it } from 'vitest';
import { enMessages } from '$lib/messages/en';
import { jaMessages } from '$lib/messages/ja';
import { resolveMessages } from '$lib/messages/resolveMessages';

describe('resolveMessages — 要件 9.5', () => {
	it('何も指定しなければ既定をそのまま返す', () => {
		expect(resolveMessages()).toEqual(jaMessages);
	});

	it('指定された項目だけを差し替える', () => {
		const messages = resolveMessages({ signInSubmit: 'ログイン' });
		expect(messages.signInSubmit).toBe('ログイン');
		expect(messages.email).toBe(jaMessages.email);
	});

	it('errors は語彙単位で差し替え、指定のない語彙は既定を残す', () => {
		const messages = resolveMessages({ errors: { 'network-error': '通信できません' } });
		expect(messages.errors['network-error']).toBe('通信できません');
		expect(messages.errors.unknown).toBe(jaMessages.errors.unknown);
	});

	it('値を差し込む文言も差し替えられる', () => {
		const messages = resolveMessages({ verifyEmailSentTo: (email) => `sent to ${email}` });
		expect(messages.verifyEmailSentTo('a@example.com')).toBe('sent to a@example.com');
	});

	it('undefined を渡した項目は既定を残す', () => {
		const messages = resolveMessages({ signInSubmit: undefined });
		expect(messages.signInSubmit).toBe(jaMessages.signInSubmit);
	});

	it('既定を書き換えない', () => {
		const before = jaMessages.errors['network-error'];
		resolveMessages({ errors: { 'network-error': '通信できません' } });
		expect(jaMessages.errors['network-error']).toBe(before);
	});
});

describe('基準の差し替え — 要件 9.4', () => {
	it('基準を渡さなければ日本語を用いる', () => {
		expect(resolveMessages({}).signInSubmit).toBe(jaMessages.signInSubmit);
	});

	it('基準に英語を渡せば、指定のない項目も英語になる', () => {
		const messages = resolveMessages({ signInSubmit: 'Log in' }, enMessages);
		expect(messages.signInSubmit).toBe('Log in');
		expect(messages.email).toBe(enMessages.email);
		expect(messages.errors.unknown).toBe(enMessages.errors.unknown);
	});

	it('基準を書き換えない', () => {
		const before = enMessages.errors['network-error'];
		resolveMessages({ errors: { 'network-error': 'offline' } }, enMessages);
		expect(enMessages.errors['network-error']).toBe(before);
	});
});

describe('追加と選択の文言の差し替え — 要件 7.4（multi-account-auth）', () => {
	it('既存と同じく項目単位で差し替えられる', () => {
		const messages = resolveMessages({
			addAccount: 'Add',
			signOutFailed: (email) => `failed ${email}`
		});
		expect(messages.addAccount).toBe('Add');
		expect(messages.signOutFailed('a@example.com', '')).toBe('failed a@example.com');
		expect(messages.signOutAll).toBe(jaMessages.signOutAll);
	});
});
