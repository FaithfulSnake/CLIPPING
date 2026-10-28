// Transcrições que chegam das capturas: o service worker guarda a leitura da
// página (e os prints, quando ela não tem o texto) e a página de notícias,
// que é quem grava a lista, monta a matéria e põe no e-mail da área.
// Só dentro da extensão.
import { apagarSessao, atualizarSessao, lerPrints, lerSessao, lerSessoes, pegarTranscricao } from './db.js';
import { encerrarOcrDepois, lerImagem } from './ocr.js';
import { materiaDaLeitura, materiaDoOcr } from './transcricao.js';

// Linhas do OCR (pixels da imagem) → posição na página (px CSS da área que rola).
function naPagina({ largura, linhas }, m, recorte) {
  const escala = largura / (recorte?.w ?? m.janela.largura);
  const dx = recorte?.x ?? 0;
  const dy = m.topo + (recorte?.y ?? 0) - (m.rolagemTopo ?? 0);
  return linhas.map((l) => ({ ...l, x: l.x / escala + dx, y: l.y / escala + dy, w: l.w / escala, h: l.h / escala }));
}

// adicionar(materia) → { id, repetida }; mostrar({ id, estado, … }) mostra o andamento.
export function iniciarTranscricoes({ adicionar, mostrar }) {
  const vistas = new Set();
  const fila = [];
  let rodando = false;

  async function transcrever(id) {
    if (!(await pegarTranscricao(id))) return; // já feita, ou outra aba está fazendo
    const s = await lerSessao(id);
    const titulo = s.leitura?.titulo || s.titulo || s.url;
    let materia;
    if (!s.precisaOcr) {
      materia = materiaDaLeitura(s.leitura);
    } else {
      const blobs = await lerPrints(id);
      mostrar({ id, titulo, estado: 'ocr', feito: 0, total: blobs.length, motivo: s.motivoOcr });
      const prints = [];
      for (const [i, blob] of blobs.entries()) {
        const m = s.medidas[i];
        const lido = await lerImagem(blob);
        prints.push({
          topoDoc: m.topo + (m.regiaoTopo ?? 0) - (m.rolagemTopo ?? 0),
          altura: m.altura,
          ocupadoTopo: m.ocupadoTopo,
          ocupadoBase: m.ocupadoBase,
          linhas: naPagina(lido, m, s.recorte),
        });
        mostrar({ id, titulo, estado: 'ocr', feito: i + 1, total: blobs.length, motivo: s.motivoOcr });
      }
      // a caixa da matéria e as imagens estão em coordenadas da página: valem quando a página inteira rola
      const leitura = s.tipoRolagem === 'janela' ? s.leitura : s.leitura && { ...s.leitura, caixa: null, imagens: [] };
      materia = materiaDoOcr({ prints, leitura, titulo: s.titulo, endereco: s.url, sessao: id });
    }
    const resultado = adicionar(materia);
    // sem prints não há o que guardar; com prints, eles ficam para conferir ("Ver prints")
    if (s.total) await atualizarSessao(id, { transcricao: 'feita', materiaId: resultado.id });
    else await apagarSessao(id);
    mostrar({ id, titulo: materia.titulo, estado: 'feita', materiaId: resultado.id, repetida: resultado.repetida, area: materia.area, ocr: Boolean(s.precisaOcr) });
  }

  async function rodar() {
    rodando = true;
    while (fila.length) {
      const id = fila.shift();
      try {
        await transcrever(id);
      } catch (e) {
        await atualizarSessao(id, { transcricao: 'erro', erro: e.message }).catch(() => {});
        mostrar({ id, estado: 'erro', mensagem: e.message });
      }
    }
    rodando = false;
    encerrarOcrDepois();
  }

  function processar(id) {
    if (!id || vistas.has(id)) return;
    vistas.add(id);
    fila.push(id);
    if (!rodando) rodar();
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.tipo === 'transcrever') processar(msg.sessao);
  });
  // as que ficaram esperando (a página abriu depois da captura)
  lerSessoes().then((lista) => {
    const esperando = (x) => x.transcricao === 'pendente' || (x.transcricao === 'fazendo' && Date.now() - (x.desde || 0) > 5 * 60_000);
    for (const s of lista.filter(esperando).sort((a, b) => a.data - b.data)) processar(s.id);
  });
}
