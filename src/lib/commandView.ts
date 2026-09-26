export type CommandView = 'chat' | 'swarm' | 'investigations' | 'system';

export function commandViewFromHash(hash: string): CommandView {
  if (hash === '#system') return 'system';
  if (hash === '#swarm') return 'swarm';
  if (hash === '#gm' || hash === '#investigations') return 'investigations';
  return 'chat';
}

export function shouldClearCommandHashForSessionSwitch(hash: string): boolean {
  return ['#swarm', '#gm', '#investigations', '#system'].includes(hash);
}

export function shouldReturnToChatOnSessionSwitch(commandView: CommandView, hash: string): boolean {
  return commandView !== 'chat' || shouldClearCommandHashForSessionSwitch(hash);
}
