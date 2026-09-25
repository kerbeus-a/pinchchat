export type CommandView = 'chat' | 'swarm' | 'gm';

export function commandViewFromHash(hash: string): CommandView {
  if (hash === '#swarm') return 'swarm';
  if (hash === '#gm') return 'gm';
  return 'chat';
}

export function shouldClearCommandHashForSessionSwitch(hash: string): boolean {
  return hash === '#swarm' || hash === '#gm';
}

export function shouldReturnToChatOnSessionSwitch(commandView: CommandView, hash: string): boolean {
  return commandView !== 'chat' || shouldClearCommandHashForSessionSwitch(hash);
}
