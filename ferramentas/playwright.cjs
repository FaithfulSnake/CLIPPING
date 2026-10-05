// Carrega o Playwright do projeto ou, se não houver, da instalação global.
const { execSync } = require('node:child_process');
const path = require('node:path');

exports.carregarPlaywright = () => {
  try {
    return require('playwright');
  } catch {
    const global = execSync('npm root -g', { encoding: 'utf8' }).trim();
    return require(path.join(global, 'playwright'));
  }
};
