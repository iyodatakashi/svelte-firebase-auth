// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}

	interface ImportMetaEnv {
		/** ショーケースの指定。`false` なら単一アカウント指定で動かす */
		readonly VITE_MULTI_ACCOUNT?: string;
	}
}

export {};
