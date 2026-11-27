/**
 * 選択中のアカウントを全タブでそろえるか。`AuthSession` に渡す。既定はそろえない（タブごと）。
 * `VITE_SYNC_ACCOUNT_ACROSS_TABS=true` でビルドすると、他のタブの切り替えに従う
 */
export const syncAccountAcrossTabs = import.meta.env.VITE_SYNC_ACCOUNT_ACROSS_TABS === 'true';
