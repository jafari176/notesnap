import type { SyncStatus } from '../../lib/sync';

const LABELS: Record<SyncStatus, string> = {
  synced: 'synced ✓',
  syncing: 'syncing…',
  offline: 'offline, will sync',
  dirty: 'unsaved changes',
};

export function SyncIndicator({ status }: { status: SyncStatus }) {
  return <div className={`notesnap-sync-indicator notesnap-sync-indicator--${status}`}>{LABELS[status]}</div>;
}
