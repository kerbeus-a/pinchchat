export type CommandView = 'chat' | 'swarm' | 'investigations' | 'review' | 'sources';

export function commandViewFromHash(hash: string): CommandView {
  if (hash === '#swarm') return 'swarm';
  if (hash === '#gm' || hash === '#investigations') return 'investigations';
  if (hash === '#review') return 'review';
  if (hash === '#sources') return 'sources';
  return 'chat';
}

export function shouldClearCommandHashForSessionSwitch(hash: string): boolean {
  return ['#swarm', '#gm', '#investigations', '#review', '#sources'].includes(hash);
}

export function shouldReturnToChatOnSessionSwitch(commandView: CommandView, hash: string): boolean {
  return commandView !== 'chat' || shouldClearCommandHashForSessionSwitch(hash);
}
