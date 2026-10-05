import { normalizarOpcoes } from './comum.js';

export async function lerOpcoes() {
  const { opcoes } = await chrome.storage.local.get('opcoes');
  return normalizarOpcoes(opcoes);
}

export function salvarOpcoes(opcoes) {
  return chrome.storage.local.set({ opcoes: normalizarOpcoes(opcoes) });
}
