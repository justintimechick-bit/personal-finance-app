export { db, FinanceDB } from './schema';
export { seedDatabase, resetDatabase, wipeDatabase, isFirstLaunch } from './seed';

import { db } from './schema';

// Export everything as a single JSON object (for file sync + backup)
export async function exportAllData() {
  const [
    accounts, liabilities, incomeSources, fixedExpenses,
    tiers, paycheckEvents, netWorthSnapshots, settings,
  ] = await Promise.all([
    db.accounts.toArray(),
    db.liabilities.toArray(),
    db.incomeSources.toArray(),
    db.fixedExpenses.toArray(),
    db.tiers.toArray(),
    db.paycheckEvents.toArray(),
    db.netWorthSnapshots.toArray(),
    db.settings.toArray(),
  ]);
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    accounts, liabilities, incomeSources, fixedExpenses,
    tiers, paycheckEvents, netWorthSnapshots, settings,
  };
}

// Restore everything from a JSON object (replaces all DB content)
export async function importAllData(data: Awaited<ReturnType<typeof exportAllData>>) {
  await db.transaction(
    'rw',
    [db.accounts, db.liabilities, db.incomeSources, db.fixedExpenses,
     db.tiers, db.paycheckEvents, db.netWorthSnapshots, db.settings],
    async () => {
      await Promise.all([
        db.accounts.clear(), db.liabilities.clear(), db.incomeSources.clear(),
        db.fixedExpenses.clear(), db.tiers.clear(), db.paycheckEvents.clear(),
        db.netWorthSnapshots.clear(), db.settings.clear(),
      ]);
      await db.accounts.bulkAdd(data.accounts);
      await db.liabilities.bulkAdd(data.liabilities);
      await db.incomeSources.bulkAdd(data.incomeSources);
      await db.fixedExpenses.bulkAdd(data.fixedExpenses);
      await db.tiers.bulkAdd(data.tiers);
      await db.paycheckEvents.bulkAdd(data.paycheckEvents);
      await db.netWorthSnapshots.bulkAdd(data.netWorthSnapshots);
      await db.settings.bulkAdd(data.settings);
    },
  );
}
