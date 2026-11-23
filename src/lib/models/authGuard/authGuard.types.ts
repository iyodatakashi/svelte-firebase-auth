import type { AuthRoutes, AuthStage } from '#lib/models/auth/auth.types';

/** 保持する戻り先。保持したときのアカウントに結びつける */
export interface HeldReturnTo {
	readonly path: string;
	/**
	 * 使用中のアカウントが離れたときに開いていた経路なら、そのアカウントの uid。
	 * アカウントを使っていない状態で開いた経路なら `null` で、どのアカウントにも使う
	 */
	readonly ownerUid: string | null;
}

/** 到達ガードが最後に内容を見せた経路と、そのときのアカウント */
export interface ShownRoute {
	readonly path: string;
	readonly uid: string;
}

/** 到達ガードの判定。効果を持たない */
export type AuthGuardDecision =
	/** 初回の判定が未了。何もしない */
	| { readonly kind: 'wait' }
	/** 現在の経路に留まってよい */
	| { readonly kind: 'allow' }
	/** 遷移せず、保護された内容を出さずに、アカウントが選ばれるのを待つ */
	| {
			readonly kind: 'select';
			/** 選択の後に戻る先として保持すべきもの。`null` は破棄を意味する */
			readonly returnTo: HeldReturnTo | null;
	  }
	| {
			readonly kind: 'redirect';
			readonly to: string;
			/** 振り替えの後に保持すべき戻り先。`null` は破棄を意味する */
			readonly returnTo: HeldReturnTo | null;
	  };

export interface AuthGuardInput {
	readonly stage: AuthStage;
	/** 現在の経路。根からの相対パス（`pathname` と問い合わせ文字列） */
	readonly currentPath: string;
	readonly routes: AuthRoutes;
	/** 保持されている戻り先。無ければ `null` */
	readonly returnTo: HeldReturnTo | null;
	/** 使用中のアカウントの uid。無ければ `null` */
	readonly accountUid: string | null;
	/** 保持しているアカウントの uid */
	readonly accountUids: readonly string[];
	/** 最後に内容を見せた経路。戻り先の持ち主を決めるのに使う */
	readonly lastShown: ShownRoute | null;
}
