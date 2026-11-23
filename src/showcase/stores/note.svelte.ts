import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { firestore } from './firebase';

/**
 * アカウント1件の文書のメモ。セキュリティルールは自分の文書だけを許す。
 *
 * 土台の App の Firestore は、作り直さずに選択中のアカウントの認証で動く。
 * ただし切り替え元で張った購読と表示は残るため、組み込み側がアカウントごとに作り直して破棄する
 */
export const createNoteStore = (uid: string) => {
	let note = $state<string | null>(null);
	let error = $state<string | null>(null);

	/** 購読を始める。解除する関数を返す */
	const start = () =>
		onSnapshot(
			doc(firestore, 'users', uid),
			(snapshot) => {
				note = snapshot.get('note') ?? null;
			},
			(snapshotError) => {
				error = snapshotError.message;
			}
		);

	/** 保存できたかを返す */
	const save = async (text: string): Promise<boolean> => {
		try {
			await setDoc(doc(firestore, 'users', uid), { note: text });
			return true;
		} catch (saveError) {
			error = saveError instanceof Error ? saveError.message : String(saveError);
			return false;
		}
	};

	return {
		get note() {
			return note;
		},
		get error() {
			return error;
		},
		start,
		save
	};
};
