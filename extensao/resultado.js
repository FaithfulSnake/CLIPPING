import { avisoMotivo, nomePrint, textoInfo } from './comum.js';
import { apagarSessao, lerPrints, lerSessao, marcarBaixado } from './db.js';
import { criarZip } from './zip.js';

const $ = (id) => document.getElementById(id);
const id = new URLSearchParams(location.search).get('sessao');
const urls = [];

async function montarZip(sessao, prints) {
  const pasta = sessao.pasta;
  const entradas = [{ nome: `${pasta}/` }];
  for (const [i, blob] of prints.entries()) {
    entradas.push({
      nome: `${pasta}/${nomePrint(i + 1, prints.length, sessao.formato)}`,
      dados: new Uint8Array(await blob.arrayBuffer()),
    });
  }
  if (sessao.incluirInfo) {
    entradas.push({ nome: `${pasta}/info.txt`, dados: new TextEncoder().encode(textoInfo({ ...sessao, total: prints.length })) });
  }
  return criarZip(entradas, new Date(sessao.data));
}

function baixar(blob, nome) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function mostrarGrade(sessao, prints) {
  const grade = $('grade');
  for (const [i, blob] of prints.entries()) {
    const url = URL.createObjectURL(blob);
    urls.push(url);
    const nome = nomePrint(i + 1, prints.length, sessao.formato);
    const figura = document.createElement('figure');
    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.title = `Abrir ${nome} em tamanho real`;
    const img = document.createElement('img');
    img.src = url;
    img.alt = `Print ${i + 1}`;
    img.loading = 'lazy';
    if (sessao.largura) {
      img.width = sessao.largura;
      img.height = sessao.altura;
    }
    const legenda = document.createElement('figcaption');
    legenda.textContent = nome;
    link.append(img);
    figura.append(link, legenda);
    grade.append(figura);
  }
}

async function main() {
  const sessao = id ? await lerSessao(id) : null;
  if (!sessao) {
    $('pasta').textContent = 'Captura não encontrada';
    $('estado').textContent = 'Ela pode ter sido apagada (a extensão guarda só as 5 capturas mais recentes). Faça a captura de novo.';
    return;
  }
  const prints = await lerPrints(id);
  const zipNome = `${sessao.pasta}.zip`;
  document.title = `${sessao.pasta} – ${prints.length} prints`;
  $('pasta').textContent = sessao.pasta;

  const detalhes = $('detalhes');
  const partes = [`${prints.length} ${prints.length === 1 ? 'print' : 'prints'}`];
  if (sessao.largura) partes.push(`${sessao.largura} × ${sessao.altura} px`);
  partes.push(new Date(sessao.data).toLocaleString('pt-BR'));
  detalhes.textContent = `${partes.join(' · ')} · `;
  const link = document.createElement('a');
  link.href = sessao.url;
  link.textContent = sessao.titulo || sessao.url;
  link.target = '_blank';
  link.rel = 'noopener';
  detalhes.append(link);

  const aviso = avisoMotivo({ ...sessao, total: prints.length });
  if (aviso) {
    $('aviso').textContent = aviso;
    $('aviso').hidden = false;
  }

  mostrarGrade(sessao, prints);

  let zip = null;
  const baixarZip = async () => {
    $('baixar').disabled = true;
    $('estado').textContent = 'Montando o ZIP…';
    try {
      zip ??= await montarZip(sessao, prints);
      baixar(zip, zipNome);
      $('estado').textContent = `Baixado como “${zipNome}” (pasta “${sessao.pasta}” com os prints numerados na ordem da página).`;
    } catch (e) {
      $('estado').textContent = `Não foi possível montar o ZIP: ${e.message}`;
    } finally {
      $('baixar').disabled = false;
    }
  };

  $('baixar').addEventListener('click', baixarZip);
  $('apagar').addEventListener('click', async () => {
    if (!confirm('Apagar estes prints da memória da extensão? O ZIP já baixado não é afetado.')) return;
    await apagarSessao(id);
    for (const url of urls) URL.revokeObjectURL(url);
    $('grade').replaceChildren();
    $('baixar').disabled = $('apagar').disabled = true;
    $('estado').textContent = 'Prints apagados da memória da extensão.';
  });
  $('baixar').disabled = $('apagar').disabled = false;

  if (sessao.baixarAuto && !sessao.baixado) {
    await marcarBaixado(id);
    await baixarZip();
  }
}

main().catch((e) => {
  $('estado').textContent = `Erro ao abrir a captura: ${e.message}`;
});
