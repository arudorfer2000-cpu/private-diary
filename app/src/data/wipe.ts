import type { Db } from '../storage/db';
import type { VaultService } from '../vault/vaultService';
import type { SettingsService } from '../settings/settings';

export type WipeDeps = {
  db: Db;
  vault: VaultService;
  settings: SettingsService;
  disableBiometric: () => Promise<void>;
};

/**
 * Deletes everything. The database goes first and is compacted; only when that worked are the keys and
 * settings removed. If the database step fails this throws and nothing else has been touched.
 */
export async function wipeAll({ db, vault, settings, disableBiometric }: WipeDeps): Promise<void> {
  await db.exec('DELETE FROM photos');
  await db.exec('DELETE FROM entries');
  await db.exec('DELETE FROM meta');
  await db.exec('VACUUM'); // rewrites the file so deleted pages do not linger in it
  await disableBiometric();
  await vault.reset();
  await settings.clear();
}
