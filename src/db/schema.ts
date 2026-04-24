import Dexie, { type Table } from 'dexie';
import type {
  Account, Liability, IncomeSource, FixedExpense, Tier,
  PaycheckEvent, NetWorthSnapshot, Settings,
} from '../types';

export class FinanceDB extends Dexie {
  accounts!: Table<Account, number>;
  liabilities!: Table<Liability, number>;
  incomeSources!: Table<IncomeSource, number>;
  fixedExpenses!: Table<FixedExpense, number>;
  tiers!: Table<Tier, number>;
  paycheckEvents!: Table<PaycheckEvent, number>;
  netWorthSnapshots!: Table<NetWorthSnapshot, number>;
  settings!: Table<Settings, number>;
  // Also stash the File System Access handle as an opaque record
  meta!: Table<{ key: string; value: any }, string>;

  constructor() {
    super('FinanceDB');
    this.version(1).stores({
      accounts: '++id, name, type',
      liabilities: '++id, name, type, isActive',
      incomeSources: '++id, name, isActive',
      fixedExpenses: '++id, name, isActive, paymentMethod',
      tiers: '++id, priority, name, isActive',
      paycheckEvents: '++id, date',
      netWorthSnapshots: '++id, date',
      settings: 'id',
      meta: 'key',
    });
  }
}

export const db = new FinanceDB();
