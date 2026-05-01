// scripts/liga/playoffs.js

// ─────────────────────────────────────────────────────────────
// calcularClassificacaoLista(jogos)
// Retorna array ordenado de {id, nome, cor, pts, ...} pelos jogos
// Exportada para uso em liga.js (aba Times) e internamente nos playoffs
// ─────────────────────────────────────────────────────────────
export function calcularClassificacaoLista(jogos) {
    const times = {};

    jogos.forEach(jogo => {
        [jogo.timeA, jogo.timeB].forEach(t => {
            if (!times[t.id]) {
                times[t.id] = { id: t.id, nome: t.nome, cor: t.cor, j: 0, v: 0, d: 0, pts: 0, cestas: 0, cestasSofridas: 0 };
            }
        });
    });

    jogos.filter(j => j.status === "finalizado").forEach(jogo => {
        const a = times[jogo.timeA.id];
        const b = times[jogo.timeB.id];
        if (!a || !b) return;

        a.j++; b.j++;
        a.cestas += jogo.placarA;    a.cestasSofridas += jogo.placarB;
        b.cestas += jogo.placarB;    b.cestasSofridas += jogo.placarA;

        if (jogo.placarA > jogo.placarB) {
            a.v++; a.pts += 3; b.d++;
        } else if (jogo.placarB > jogo.placarA) {
            b.v++; b.pts += 3; a.d++;
        } else {
            a.v++; a.pts += 1; b.v++; b.pts += 1;
        }
    });

    return Object.values(times).sort((x, y) => {
        if (y.pts !== x.pts) return y.pts - x.pts;
        const sx = x.cestas - x.cestasSofridas;
        const sy = y.cestas - y.cestasSofridas;
        if (sy !== sx) return sy - sx;
        return y.cestas - x.cestas;
    });
}
// Modulo de playoffs - gerenciamento do chaveamento eliminatorio
//
// Uso em liga.js:
//   import { initPlayoffs } from './liga/playoffs.js';
//   const po = initPlayoffs(ctx);

export function initPlayoffs(ctx) {
    const {
        db, collection, doc, getDocs, updateDoc, writeBatch,
        serverTimestamp, query, orderBy,
        mostrarFeedback, carregarLigasAdmin
    } = ctx;


    // ════════════════════════════════════════════════════════════════
    // PLAYOFFS — Fase eliminatória melhor de 3
    // ════════════════════════════════════════════════════════════════

    // ─── Estado dos playoffs ─────────────────────────────────────
    let poState = {
        ligaId:      null,
        ligaNome:    "",
        confrontos:  [],    // array carregado do Firestore
        jogoAtivo:   null   // confronto aberto no modal de registrar jogo
    };

    // ─── DOM refs: modal iniciar playoffs ────────────────────────
    const modalIniciarPlayoffs       = document.getElementById("modal-iniciar-playoffs");
    const btnFecharIniciarPlayoffs   = document.getElementById("btn-fechar-iniciar-playoffs");
    const btnCancelarIniciarPlayoffs = document.getElementById("btn-cancelar-iniciar-playoffs");
    const btnConfirmarPlayoffs       = document.getElementById("btn-confirmar-playoffs");
    const poNumTimes                 = document.getElementById("po-num-times");

    // ─── DOM refs: modal bracket ─────────────────────────────────
    const modalPlayoffs    = document.getElementById("modal-playoffs");
    const poLigaNomeEl     = document.getElementById("po-liga-nome");
    const poCorpo          = document.getElementById("po-corpo");
    const btnFecharPlayoffs = document.getElementById("btn-fechar-playoffs");

    // ─── DOM refs: modal registrar jogo ──────────────────────────
    const modalJogoPlayoff    = document.getElementById("modal-jogo-playoff");
    const poJogoTitulo        = document.getElementById("po-jogo-titulo");
    const poJogoConfrontoEl   = document.getElementById("po-jogo-confronto");
    const poJogoLabelA        = document.getElementById("po-jogo-label-a");
    const poJogoLabelB        = document.getElementById("po-jogo-label-b");
    const poJogoInputA        = document.getElementById("po-jogo-placar-a");
    const poJogoInputB        = document.getElementById("po-jogo-placar-b");
    const btnFecharJogoPlayoff = document.getElementById("btn-fechar-jogo-playoff");
    const btnSalvarJogoPlayoff = document.getElementById("btn-salvar-jogo-playoff");

    // Fechar modais
    btnFecharIniciarPlayoffs.addEventListener("click", fecharModalIniciarPlayoffs);
    btnCancelarIniciarPlayoffs.addEventListener("click", fecharModalIniciarPlayoffs);
    modalIniciarPlayoffs.addEventListener("click", e => { if (e.target === modalIniciarPlayoffs) fecharModalIniciarPlayoffs(); });

    btnFecharPlayoffs.addEventListener("click", fecharModalPlayoffs);
    modalPlayoffs.addEventListener("click", e => { if (e.target === modalPlayoffs) fecharModalPlayoffs(); });

    btnFecharJogoPlayoff.addEventListener("click", fecharJogoPlayoff);
    modalJogoPlayoff.addEventListener("click", e => { if (e.target === modalJogoPlayoff) fecharJogoPlayoff(); });

    function fecharModalIniciarPlayoffs() {
        modalIniciarPlayoffs.classList.add("oculto");
    }

    function fecharModalPlayoffs() {
        modalPlayoffs.classList.add("oculto");
        document.body.style.overflow = "";
    }

    function fecharJogoPlayoff() {
        modalJogoPlayoff.classList.add("oculto");
        poState.jogoAtivo = null;
    }

    // ─────────────────────────────────────────────────────────────
    // abrirModalIniciarPlayoffs(ligaId, ligaNome)
    // Abre o mini-modal para o admin escolher quantos times avançam
    // ─────────────────────────────────────────────────────────────
    function abrirModalIniciarPlayoffs(ligaId, ligaNome) {
        poState.ligaId   = ligaId;
        poState.ligaNome = ligaNome;
        modalIniciarPlayoffs.classList.remove("oculto");
    }

    // Confirmar: gera o chaveamento
    btnConfirmarPlayoffs.addEventListener("click", async () => {
        const numTimes = parseInt(poNumTimes.value);
        btnConfirmarPlayoffs.textContent = "Gerando...";
        btnConfirmarPlayoffs.disabled = true;

        const ok = await gerarPlayoffs(poState.ligaId, numTimes);

        btnConfirmarPlayoffs.textContent = "Gerar Chaveamento ⚡";
        btnConfirmarPlayoffs.disabled = false;

        if (ok) fecharModalIniciarPlayoffs();
    });

    // ─────────────────────────────────────────────────────────────
    // gerarPlayoffs(ligaId, numTimes)
    // Cria os confrontos no Firestore baseado na classificação atual
    // Liga passa para status "playoffs"
    // ─────────────────────────────────────────────────────────────
    async function gerarPlayoffs(ligaId, numTimes) {
        mostrarFeedback("Calculando classificação...", "info");

        try {
            // Carrega jogos da fase de grupos para calcular a classificação
            const q    = query(collection(db, "ligas", ligaId, "jogos"), orderBy("rodada"));
            const snap = await getDocs(q);
            const jogos = snap.docs.map(d => ({ id: d.id, ...d.data() }));

            const classificacao = calcularClassificacaoLista(jogos);

            if (classificacao.length < numTimes) {
                mostrarFeedback(`Só há ${classificacao.length} times. Escolha um número menor.`, "erro");
                return false;
            }

            // Seeds: top N times pelo ranking
            const seeds = classificacao.slice(0, numTimes);

            // Helper: extrai só id, nome e cor (para salvar no Firestore)
            const toTime = t => ({ id: t.id, nome: t.nome, cor: t.cor });

            const playoffsRef = collection(db, "ligas", ligaId, "playoffs");
            const batch       = writeBatch(db);

            let confrontosData = [];

            if (numTimes === 2) {
                // Final direta: seed 1 × seed 2
                const finalRef = doc(playoffsRef);
                confrontosData = [{
                    ref: finalRef,
                    data: { fase: "final", ordem: 1, timeA: toTime(seeds[0]), timeB: toTime(seeds[1]), vitA: 0, vitB: 0, vencedor: null, proximoId: null, proximoLado: null, jogos: [], criadoEm: serverTimestamp() }
                }];

            } else if (numTimes === 4) {
                // Semis: (1×4) e (2×3) → Final
                const s1Ref    = doc(playoffsRef);
                const s2Ref    = doc(playoffsRef);
                const finalRef = doc(playoffsRef);

                confrontosData = [
                    { ref: s1Ref,    data: { fase: "semi",  ordem: 1, timeA: toTime(seeds[0]), timeB: toTime(seeds[3]), vitA: 0, vitB: 0, vencedor: null, proximoId: finalRef.id, proximoLado: "A", jogos: [], criadoEm: serverTimestamp() } },
                    { ref: s2Ref,    data: { fase: "semi",  ordem: 2, timeA: toTime(seeds[1]), timeB: toTime(seeds[2]), vitA: 0, vitB: 0, vencedor: null, proximoId: finalRef.id, proximoLado: "B", jogos: [], criadoEm: serverTimestamp() } },
                    { ref: finalRef, data: { fase: "final", ordem: 1, timeA: null, timeB: null,              vitA: 0, vitB: 0, vencedor: null, proximoId: null,         proximoLado: null, jogos: [], criadoEm: serverTimestamp() } }
                ];

            } else if (numTimes === 8) {
                // Quartas: (1×8),(4×5),(2×7),(3×6) → Semis → Final
                const q1Ref = doc(playoffsRef);
                const q2Ref = doc(playoffsRef);
                const q3Ref = doc(playoffsRef);
                const q4Ref = doc(playoffsRef);
                const s1Ref = doc(playoffsRef);
                const s2Ref = doc(playoffsRef);
                const finalRef = doc(playoffsRef);

                confrontosData = [
                    { ref: q1Ref,    data: { fase: "quartas", ordem: 1, timeA: toTime(seeds[0]), timeB: toTime(seeds[7]), vitA: 0, vitB: 0, vencedor: null, proximoId: s1Ref.id, proximoLado: "A", jogos: [], criadoEm: serverTimestamp() } },
                    { ref: q2Ref,    data: { fase: "quartas", ordem: 2, timeA: toTime(seeds[3]), timeB: toTime(seeds[4]), vitA: 0, vitB: 0, vencedor: null, proximoId: s1Ref.id, proximoLado: "B", jogos: [], criadoEm: serverTimestamp() } },
                    { ref: q3Ref,    data: { fase: "quartas", ordem: 3, timeA: toTime(seeds[1]), timeB: toTime(seeds[6]), vitA: 0, vitB: 0, vencedor: null, proximoId: s2Ref.id, proximoLado: "A", jogos: [], criadoEm: serverTimestamp() } },
                    { ref: q4Ref,    data: { fase: "quartas", ordem: 4, timeA: toTime(seeds[2]), timeB: toTime(seeds[5]), vitA: 0, vitB: 0, vencedor: null, proximoId: s2Ref.id, proximoLado: "B", jogos: [], criadoEm: serverTimestamp() } },
                    { ref: s1Ref,    data: { fase: "semi",    ordem: 1, timeA: null, timeB: null, vitA: 0, vitB: 0, vencedor: null, proximoId: finalRef.id, proximoLado: "A", jogos: [], criadoEm: serverTimestamp() } },
                    { ref: s2Ref,    data: { fase: "semi",    ordem: 2, timeA: null, timeB: null, vitA: 0, vitB: 0, vencedor: null, proximoId: finalRef.id, proximoLado: "B", jogos: [], criadoEm: serverTimestamp() } },
                    { ref: finalRef, data: { fase: "final",   ordem: 1, timeA: null, timeB: null, vitA: 0, vitB: 0, vencedor: null, proximoId: null,         proximoLado: null, jogos: [], criadoEm: serverTimestamp() } }
                ];
            }

            // Salva todos os confrontos + muda status da liga para "playoffs"
            confrontosData.forEach(({ ref, data }) => batch.set(ref, data));
            batch.update(doc(db, "ligas", ligaId), { status: "playoffs" });
            await batch.commit();

            mostrarFeedback("Playoffs iniciados! ⚡", "sucesso");
            await carregarLigasAdmin();
            return true;

        } catch (erro) {
            console.error("Erro ao gerar playoffs:", erro);
            mostrarFeedback("Erro ao gerar playoffs.", "erro");
            return false;
        }
    }

    // ─────────────────────────────────────────────────────────────
    // abrirModalPlayoffs(ligaId, ligaNome)
    // Carrega os confrontos do Firestore e abre o modal de bracket
    // ─────────────────────────────────────────────────────────────
    async function abrirModalPlayoffs(ligaId, ligaNome) {
        poState.ligaId   = ligaId;
        poState.ligaNome = ligaNome;
        poState.confrontos = [];

        poLigaNomeEl.textContent = `⚡ Playoffs — ${ligaNome}`;
        poCorpo.innerHTML = '<p class="draft-carregando">Carregando chaveamento...</p>';

        modalPlayoffs.classList.remove("oculto");
        document.body.style.overflow = "hidden";

        try {
            const snap = await getDocs(collection(db, "ligas", ligaId, "playoffs"));
            poState.confrontos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            renderizarBracketAdmin();
        } catch (erro) {
            console.error("Erro ao carregar playoffs:", erro);
            poCorpo.innerHTML = '<p class="draft-carregando">Erro ao carregar playoffs.</p>';
        }
    }

    // ─────────────────────────────────────────────────────────────
    // renderizarBracketAdmin()
    // Exibe o bracket completo no modal do admin com botões de edição
    // ─────────────────────────────────────────────────────────────
    function renderizarBracketAdmin() {
        const ordemFases  = ["quartas", "semi", "final"];
        const nomesFase   = { quartas: "⚡ Quartas de Final", semi: "🔥 Semifinais", final: "🏆 Final" };

        // Agrupa por fase
        const porFase = {};
        poState.confrontos.forEach(c => {
            if (!porFase[c.fase]) porFase[c.fase] = [];
            porFase[c.fase].push(c);
        });

        let html = "";
        ordemFases.filter(f => porFase[f]).forEach(fase => {
            const lista = porFase[fase].sort((a, b) => a.ordem - b.ordem);
            html += `
                <div class="po-fase">
                    <div class="po-fase-label">${nomesFase[fase] || fase}</div>
                    <div class="po-confrontos">
                        ${lista.map(c => renderizarCardConfronto(c, true)).join("")}
                    </div>
                </div>
            `;
        });

        poCorpo.innerHTML = html || '<p class="draft-carregando">Nenhum confronto encontrado.</p>';

        // Listeners nos botões de registrar jogo
        poCorpo.querySelectorAll(".btn-po-registrar").forEach(btn => {
            btn.addEventListener("click", () => {
                const c = poState.confrontos.find(x => x.id === btn.dataset.confrontoId);
                if (c) abrirJogoPlayoff(c);
            });
        });
    }

    // ─────────────────────────────────────────────────────────────
    // renderizarCardConfronto(c, ehAdmin)
    // Retorna o HTML de um card de confronto do bracket
    // ─────────────────────────────────────────────────────────────
    function renderizarCardConfronto(c, ehAdmin) {
        const temTimes  = c.timeA && c.timeB;
        const finalizado = !!c.vencedor;

        const nomeA = c.timeA ? c.timeA.nome : "A definir";
        const nomeB = c.timeB ? c.timeB.nome : "A definir";
        const corA  = c.timeA ? c.timeA.cor  : "#444";
        const corB  = c.timeB ? c.timeB.cor  : "#444";

        const vitA = c.vitA ?? 0;
        const vitB = c.vitB ?? 0;

        // Histórico de jogos da série
        const historicoHTML = (c.jogos || []).map((j, i) => `
            <div class="po-historico-jogo">
                <span class="po-historico-label">Jogo ${i + 1}</span>
                <span class="po-historico-placar ${j.placarA > j.placarB ? "po-num-vencedor" : ""}">${j.placarA}</span>
                <span class="po-historico-sep">×</span>
                <span class="po-historico-placar ${j.placarB > j.placarA ? "po-num-vencedor" : ""}">${j.placarB}</span>
            </div>
        `).join("");

        const campeaoHTML = (c.fase === "final" && finalizado)
            ? `<div class="po-campeao-badge">🏆 Campeão: ${c.vencedor.nome}</div>`
            : (finalizado ? `<div class="po-avanca-badge">✅ ${c.vencedor.nome} avança</div>` : "");

        const btnRegistrar = (ehAdmin && temTimes && !finalizado)
            ? `<button class="btn-po-registrar" data-confronto-id="${c.id}">+ Jogo ${(c.jogos?.length ?? 0) + 1}</button>`
            : "";

        return `
            <div class="po-card ${finalizado ? "po-card-finalizado" : ""} ${!temTimes ? "po-card-aguardando" : ""}">
                <div class="po-card-times">
                    <div class="po-time ${c.vencedor && c.timeA && c.vencedor.id === c.timeA.id ? "po-time-ganhou" : ""}">
                        <span class="po-time-cor" style="background:${corA}"></span>
                        <span class="po-time-nome">${nomeA}</span>
                        <span class="po-serie-pts">${vitA}</span>
                    </div>
                    <span class="po-serie-vs">×</span>
                    <div class="po-time po-time-dir ${c.vencedor && c.timeB && c.vencedor.id === c.timeB.id ? "po-time-ganhou" : ""}">
                        <span class="po-serie-pts">${vitB}</span>
                        <span class="po-time-nome">${nomeB}</span>
                        <span class="po-time-cor" style="background:${corB}"></span>
                    </div>
                </div>
                ${historicoHTML ? `<div class="po-historico">${historicoHTML}</div>` : ""}
                ${campeaoHTML}
                ${btnRegistrar ? `<div class="po-card-acoes">${btnRegistrar}</div>` : ""}
            </div>
        `;
    }

    // ─────────────────────────────────────────────────────────────
    // abrirJogoPlayoff(confronto)
    // Abre o mini-modal para registrar o placar de um jogo da série
    // ─────────────────────────────────────────────────────────────
    function abrirJogoPlayoff(confronto) {
        poState.jogoAtivo = confronto;

        const numJogo = (confronto.jogos?.length ?? 0) + 1;
        poJogoTitulo.textContent = `Jogo ${numJogo} da série`;

        poJogoConfrontoEl.innerHTML = `
            <span class="confronto-time" style="color:${confronto.timeA.cor}">${confronto.timeA.nome}</span>
            <span class="confronto-vs">×</span>
            <span class="confronto-time" style="color:${confronto.timeB.cor}">${confronto.timeB.nome}</span>
        `;
        poJogoLabelA.textContent = confronto.timeA.nome;
        poJogoLabelB.textContent = confronto.timeB.nome;
        poJogoInputA.value = "";
        poJogoInputB.value = "";

        modalJogoPlayoff.classList.remove("oculto");
    }

    // Salva o resultado do jogo e verifica se a série acabou
    btnSalvarJogoPlayoff.addEventListener("click", async () => {
        const confronto = poState.jogoAtivo;
        if (!confronto) return;

        const placarA = parseInt(poJogoInputA.value);
        const placarB = parseInt(poJogoInputB.value);

        if (isNaN(placarA) || isNaN(placarB) || placarA < 0 || placarB < 0) {
            mostrarFeedback("Insira os placares de ambos os times.", "erro");
            return;
        }

        // Acumula o novo jogo na lista existente
        const novosJogos = [...(confronto.jogos || []), { placarA, placarB }];

        // Recalcula vitórias na série
        let vitA = 0, vitB = 0;
        novosJogos.forEach(j => {
            if (j.placarA > j.placarB) vitA++;
            else if (j.placarB > j.placarA) vitB++;
        });

        // Melhor de 3: quem chegar a 2 vitórias vence a série
        let vencedor = null;
        if (vitA >= 2) vencedor = confronto.timeA;
        else if (vitB >= 2) vencedor = confronto.timeB;

        try {
            const confrontoRef = doc(db, "ligas", poState.ligaId, "playoffs", confronto.id);
            await updateDoc(confrontoRef, { jogos: novosJogos, vitA, vitB, vencedor });

            // Atualiza estado local
            const idx = poState.confrontos.findIndex(c => c.id === confronto.id);
            poState.confrontos[idx] = { ...confronto, jogos: novosJogos, vitA, vitB, vencedor };

            // Se a série terminou, avança o vencedor para o próximo confronto
            if (vencedor && confronto.proximoId) {
                const campo = confronto.proximoLado === "A" ? "timeA" : "timeB";
                const proximoRef = doc(db, "ligas", poState.ligaId, "playoffs", confronto.proximoId);
                await updateDoc(proximoRef, { [campo]: vencedor });

                // Atualiza estado local do próximo confronto
                const proximoIdx = poState.confrontos.findIndex(c => c.id === confronto.proximoId);
                if (proximoIdx >= 0) {
                    poState.confrontos[proximoIdx] = {
                        ...poState.confrontos[proximoIdx],
                        [campo]: vencedor
                    };
                }
            }

            // Se foi a final: encerra a liga e registra o campeão
            if (vencedor && confronto.fase === "final") {
                await updateDoc(doc(db, "ligas", poState.ligaId), {
                    status:  "encerrado",
                    campeao: vencedor
                });
                mostrarFeedback(`🏆 ${vencedor.nome} é o campeão!`, "sucesso");
            } else {
                mostrarFeedback("Resultado salvo! 🏀", "sucesso");
            }

            fecharJogoPlayoff();
            renderizarBracketAdmin();

        } catch (erro) {
            console.error("Erro ao salvar jogo de playoff:", erro);
            mostrarFeedback("Erro ao salvar resultado.", "erro");
        }
    });

    // ─────────────────────────────────────────────────────────────
    // renderizarPlayoffsJogador()
    // View de playoffs para o jogador — read-only, sem botões de edição
    // ─────────────────────────────────────────────────────────────
    async function renderizarPlayoffsJogador() {
        ctx.getVjcPlayoffsEl().innerHTML = '<p class="vjc-carregando">Carregando playoffs...</p>';

        try {
            const snap = await getDocs(collection(db, "ligas", ctx.getVjcState().ligaId, "playoffs"));
            const confrontos = snap.docs.map(d => ({ id: d.id, ...d.data() }));

            if (confrontos.length === 0) {
                ctx.getVjcPlayoffsEl().innerHTML = '<p class="vjc-vazio">Os playoffs ainda não foram gerados.</p>';
                return;
            }

            const ordemFases = ["quartas", "semi", "final"];
            const nomesFase  = { quartas: "⚡ Quartas de Final", semi: "🔥 Semifinais", final: "🏆 Final" };
            const porFase    = {};
            confrontos.forEach(c => {
                if (!porFase[c.fase]) porFase[c.fase] = [];
                porFase[c.fase].push(c);
            });

            let html = "";
            ordemFases.filter(f => porFase[f]).forEach(fase => {
                const lista = porFase[fase].sort((a, b) => a.ordem - b.ordem);
                html += `
                    <div class="vjc-po-fase">
                        <div class="vjc-po-fase-label">${nomesFase[fase]}</div>
                        <div class="vjc-po-confrontos">
                            ${lista.map(c => renderizarCardConfrontoJogador(c)).join("")}
                        </div>
                    </div>
                `;
            });

            ctx.getVjcPlayoffsEl().innerHTML = html;

        } catch (erro) {
            console.error("Erro ao carregar playoffs:", erro);
            ctx.getVjcPlayoffsEl().innerHTML = '<p class="vjc-vazio">Erro ao carregar playoffs.</p>';
        }
    }

    // Card de confronto read-only para o jogador
    function renderizarCardConfrontoJogador(c) {
        const temTimes   = c.timeA && c.timeB;
        const finalizado = !!c.vencedor;

        const nomeA = c.timeA ? c.timeA.nome : "A definir";
        const nomeB = c.timeB ? c.timeB.nome : "A definir";
        const corA  = c.timeA ? c.timeA.cor  : "#333";
        const corB  = c.timeB ? c.timeB.cor  : "#333";
        const vitA  = c.vitA ?? 0;
        const vitB  = c.vitB ?? 0;

        const historicoHTML = (c.jogos || []).map((j, i) => `
            <div class="vjc-po-jogo">
                <span>Jogo ${i + 1}</span>
                <span class="vjc-po-num ${j.placarA > j.placarB ? "vjc-po-venc" : ""}">${j.placarA}</span>
                <span class="vjc-po-sep">×</span>
                <span class="vjc-po-num ${j.placarB > j.placarA ? "vjc-po-venc" : ""}">${j.placarB}</span>
            </div>
        `).join("");

        const badgeHTML = (c.fase === "final" && finalizado)
            ? `<div class="vjc-po-campeao">🏆 Campeão: ${c.vencedor.nome}</div>`
            : (finalizado ? `<div class="vjc-po-avanca">✅ ${c.vencedor.nome} avança</div>` : "");

        return `
            <div class="vjc-po-card ${finalizado ? "vjc-po-finalizado" : ""} ${!temTimes ? "vjc-po-aguardando" : ""}">
                <div class="vjc-po-times">
                    <div class="vjc-po-time ${c.vencedor && c.timeA && c.vencedor.id === c.timeA.id ? "vjc-po-ganhou" : ""}">
                        <span class="vjc-po-barra" style="background:${corA}"></span>
                        <span class="vjc-po-nome">${nomeA}</span>
                        <span class="vjc-po-serie">${vitA}</span>
                    </div>
                    <span class="vjc-po-vs">×</span>
                    <div class="vjc-po-time vjc-po-time-dir ${c.vencedor && c.timeB && c.vencedor.id === c.timeB.id ? "vjc-po-ganhou" : ""}">
                        <span class="vjc-po-serie">${vitB}</span>
                        <span class="vjc-po-nome">${nomeB}</span>
                        <span class="vjc-po-barra" style="background:${corB}"></span>
                    </div>
                </div>
                ${historicoHTML ? `<div class="vjc-po-historico">${historicoHTML}</div>` : ""}
                ${badgeHTML}
            </div>
        `;
    }


    // Funcoes publicas que liga.js precisa chamar externamente
    return { abrirModalIniciarPlayoffs, abrirModalPlayoffs, renderizarPlayoffsJogador };
}
