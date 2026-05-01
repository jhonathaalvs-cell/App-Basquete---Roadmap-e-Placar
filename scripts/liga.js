// ─────────────────────────────────────────────────────────────
// liga.js — Fase 1 + Fase 2
//
// Fase 1: Filtro de acesso (admin/jogador), criar liga, listar ligas
// Fase 2: Checklist de inscrição, validação de e-mail, confirmar inscrição,
//         exibir contador de inscritos (admin), fechar inscrições (admin)
// ─────────────────────────────────────────────────────────────

import { auth, db } from "./firebase-config.js";

import {
    onAuthStateChanged,
    sendEmailVerification
} from "https://www.gstatic.com/firebasejs/12.12.1/firebase-auth.js";

import {
    doc,
    getDoc,
    setDoc,
    updateDoc,
    collection,
    addDoc,
    getDocs,
    query,
    orderBy,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.12.1/firebase-firestore.js";

// ─── Estado global do módulo ──────────────────────────────────
// Guardamos o usuário logado aqui para usar em qualquer função
let usuarioAtual = null;
let ligaIdAtual  = null; // ID da liga cujo modal está aberto
let roleAtual    = "jogador"; // role do usuário logado (admin | jogador)

// ─── Referências ao HTML ──────────────────────────────────────
const telaLoading      = document.getElementById("tela-loading");
const painelAdmin      = document.getElementById("painel-admin");
const painelJogador    = document.getElementById("painel-jogador");

const btnAbrirForm     = document.getElementById("btn-abrir-form");
const formNovaLiga     = document.getElementById("form-nova-liga");
const btnSalvarLiga    = document.getElementById("btn-salvar-liga");
const btnCancelarForm  = document.getElementById("btn-cancelar-form");

const inputNome        = document.getElementById("input-nome-liga");
const inputDescricao   = document.getElementById("input-descricao");
const inputDataInicio  = document.getElementById("input-data-inicio");
const inputMaxTimes    = document.getElementById("input-max-times");
const inputJogadores   = document.getElementById("input-jogadores-time");

const listaAdmin       = document.getElementById("lista-ligas-admin");
const semLigasAdmin    = document.getElementById("sem-ligas-admin");
const listaJogador     = document.getElementById("lista-ligas-jogador");
const semLigasJogador  = document.getElementById("sem-ligas-jogador");

const msgFeedback      = document.getElementById("msg-feedback");

// Modal de inscrição
const modalInscricao        = document.getElementById("modal-inscricao");
const modalLigaNome         = document.getElementById("modal-liga-nome");
const btnFecharModal        = document.getElementById("btn-fechar-modal");
const checklistContainer    = document.getElementById("checklist-container");
const estadoInscrito        = document.getElementById("estado-inscrito");
const btnConfirmarInscricao = document.getElementById("btn-confirmar-inscricao");

// ════════════════════════════════════════════════════════════════
// PONTO DE ENTRADA
// Aguarda o Firebase confirmar quem está logado antes de tudo
// ════════════════════════════════════════════════════════════════
onAuthStateChanged(auth, async (usuario) => {
    if (!usuario) {
        window.location.href = "index.html";
        return;
    }

    usuarioAtual = usuario; // salva globalmente para uso nas outras funções

    const role = await lerRole(usuario.uid);
    roleAtual  = role; // salva o role globalmente (usado em abrirCalendario, draft etc.)

    telaLoading.classList.add("oculto");

    if (role === "admin") {
        painelAdmin.classList.remove("oculto");
        await carregarLigasAdmin();
    } else {
        painelJogador.classList.remove("oculto");
        await carregarLigasJogador();
    }
});

// ════════════════════════════════════════════════════════════════
// FASE 1 — ADMIN: criar liga
// ════════════════════════════════════════════════════════════════

btnAbrirForm.addEventListener("click", () => {
    formNovaLiga.classList.remove("oculto");
    btnAbrirForm.classList.add("oculto");
});

btnCancelarForm.addEventListener("click", () => {
    fecharFormulario();
});

btnSalvarLiga.addEventListener("click", async () => {
    const nome      = inputNome.value.trim();
    const descricao = inputDescricao.value.trim();
    const data      = inputDataInicio.value;
    const maxTimes  = parseInt(inputMaxTimes.value);
    const jogadores = parseInt(inputJogadores.value);

    if (!nome) {
        mostrarFeedback("Dê um nome para a liga antes de salvar.", "erro");
        return;
    }
    if (!data) {
        mostrarFeedback("Informe a data de início das inscrições.", "erro");
        return;
    }
    if (isNaN(maxTimes) || maxTimes < 2) {
        mostrarFeedback("Informe ao menos 2 times.", "erro");
        return;
    }
    if (isNaN(jogadores) || jogadores < 1) {
        mostrarFeedback("Informe ao menos 1 jogador por time.", "erro");
        return;
    }

    try {
        mostrarFeedback("Salvando liga...", "info");
        btnSalvarLiga.disabled = true;

        await addDoc(collection(db, "ligas"), {
            nome,
            descricao,
            dataInicio:       data,
            maxTimes,
            jogadoresPorTime: jogadores,
            status:           "inscricoes",
            criadoEm:         serverTimestamp(),
            criadoPor:        auth.currentUser.uid
        });

        mostrarFeedback(`Liga "${nome}" criada com sucesso! 🏆`, "sucesso");
        fecharFormulario();
        await carregarLigasAdmin();

    } catch (erro) {
        console.error("Erro ao salvar liga:", erro);
        mostrarFeedback("Erro ao salvar. Tente novamente.", "erro");
    } finally {
        btnSalvarLiga.disabled = false;
    }
});

// ════════════════════════════════════════════════════════════════
// FASE 1 — CARREGAR LIGAS
// ════════════════════════════════════════════════════════════════

async function carregarLigasAdmin() {
    try {
        const q    = query(collection(db, "ligas"), orderBy("criadoEm", "desc"));
        const snap = await getDocs(q);

        listaAdmin.querySelectorAll(".card-liga").forEach(c => c.remove());

        if (snap.empty) {
            semLigasAdmin.style.display = "block";
            return;
        }

        semLigasAdmin.style.display = "none";

        // Renderiza cada card e, depois, busca o número de inscritos de forma assíncrona
        for (const docSnap of snap.docs) {
            const card = criarCardLiga(docSnap.data(), docSnap.id, true);
            listaAdmin.appendChild(card);
            // Atualiza o contador de inscritos após inserir o card no DOM
            atualizarContadorInscritos(docSnap.id);
        }

    } catch (erro) {
        console.error("Erro ao carregar ligas (admin):", erro);
        mostrarFeedback("Erro ao carregar ligas.", "erro");
    }
}

async function carregarLigasJogador() {
    try {
        const q    = query(collection(db, "ligas"), orderBy("criadoEm", "desc"));
        const snap = await getDocs(q);

        listaJogador.querySelectorAll(".card-liga").forEach(c => c.remove());

        const ligasVisiveis = snap.docs.filter(d => {
            const s = d.data().status;
            return s === "inscricoes" || s === "ativo";
        });

        if (ligasVisiveis.length === 0) {
            semLigasJogador.style.display = "block";
            return;
        }

        semLigasJogador.style.display = "none";

        for (const docSnap of ligasVisiveis) {
            const card = criarCardLiga(docSnap.data(), docSnap.id, false);
            listaJogador.appendChild(card);
        }

    } catch (erro) {
        console.error("Erro ao carregar ligas (jogador):", erro);
        mostrarFeedback("Erro ao carregar ligas.", "erro");
    }
}

// ─────────────────────────────────────────────────────────────
// atualizarContadorInscritos(ligaId)
// Busca a subcoleção inscricoes e atualiza o span no card do admin
// ─────────────────────────────────────────────────────────────
async function atualizarContadorInscritos(ligaId) {
    try {
        const snap = await getDocs(collection(db, "ligas", ligaId, "inscricoes"));
        const spanContador = document.getElementById(`contador-${ligaId}`);
        if (spanContador) {
            spanContador.textContent = `👥 ${snap.size} inscrito(s)`;
        }
    } catch (erro) {
        console.error("Erro ao contar inscritos:", erro);
    }
}

// ─────────────────────────────────────────────────────────────
// criarCardLiga(liga, id, ehAdmin)
// Monta o card de uma liga.
// Admin: exibe contador de inscritos + botão "Fechar Inscrições"
// Jogador: exibe botão "Ver Liga" que abre o modal de inscrição
// ─────────────────────────────────────────────────────────────
function criarCardLiga(liga, id, ehAdmin) {
    const card = document.createElement("div");
    card.classList.add("card-liga");

    const statusTexto = {
        inscricoes: "🟢 Inscrições abertas",
        draft:      "🟡 Montando times",
        ativo:      "🔴 Em andamento",
        encerrado:  "⚫ Encerrado"
    };

    const dataFormatada = liga.dataInicio
        ? liga.dataInicio.split("-").reverse().join("/")
        : "—";

    // Escapa aspas no nome para uso seguro em data-* attributes
    const nomeEscapado = liga.nome.replace(/"/g, "&quot;");

    card.innerHTML = `
        <div class="card-cabecalho">
            <h4 class="card-nome">${liga.nome}</h4>
            <span class="badge-status ${liga.status}">${statusTexto[liga.status] || liga.status}</span>
        </div>

        ${liga.descricao ? `<p class="card-descricao">${liga.descricao}</p>` : ""}

        <div class="card-info">
            <span>📅 Início: ${dataFormatada}</span>
            <span>🏅 Times: ${liga.maxTimes}</span>
            <span>👤 ${liga.jogadoresPorTime} por time</span>
        </div>

        ${ehAdmin ? `
        <div class="card-acoes-admin">
            <span id="contador-${id}" class="badge-contador">👥 carregando...</span>

            <button class="btn-editar-liga" data-liga-id="${id}" title="Editar liga">✏️</button>

            ${liga.status === "inscricoes" ? `
            <button class="btn-fechar-inscricoes" data-liga-id="${id}" data-liga-nome="${nomeEscapado}">
                Fechar Inscrições
            </button>
            ` : ""}

            ${liga.status === "draft" ? `
            <button class="btn-montar-times" data-liga-id="${id}" data-liga-nome="${nomeEscapado}" data-liga-jogadores="${liga.jogadoresPorTime}">
                🏀 Montar Times
            </button>
            ` : ""}

            ${liga.status === "ativo" ? `
            <button class="btn-ver-calendario" data-liga-id="${id}" data-liga-nome="${nomeEscapado}">
                📅 Calendário e Placar
            </button>
            ` : ""}
        </div>
        ` : `
        ${liga.status === "inscricoes" ? `
        <button class="btn-inscricao" data-liga-id="${id}" data-liga-nome="${nomeEscapado}">
            Ver Liga
        </button>
        ` : ""}
        ${liga.status === "ativo" ? `
        <button class="btn-ver-calendario" data-liga-id="${id}" data-liga-nome="${nomeEscapado}">
            📅 Ver Calendário
        </button>
        ` : ""}
        `}
    `;

    return card;
}

// ════════════════════════════════════════════════════════════════
// FASE 2 — EVENT DELEGATION nos cards (botões criados dinamicamente)
// Em vez de adicionar listener em cada botão, escutamos o clique
// no container pai e verificamos qual botão foi clicado
// ════════════════════════════════════════════════════════════════

// Jogador: clicou em "Ver Liga" ou "Ver Calendário"
listaJogador.addEventListener("click", (evento) => {
    const btnInscricao = evento.target.closest(".btn-inscricao");
    if (btnInscricao) {
        abrirModalInscricao(btnInscricao.dataset.ligaId, btnInscricao.dataset.ligaNome);
        return;
    }
    const btnCal = evento.target.closest(".btn-ver-calendario");
    if (btnCal) {
        abrirCalendario(btnCal.dataset.ligaId, btnCal.dataset.ligaNome);
    }
});

// Admin: clicou em "Fechar Inscrições"
listaAdmin.addEventListener("click", async (evento) => {
    // Admin: clicou em "✏️ Editar"
    const btnEditar = evento.target.closest(".btn-editar-liga");
    if (btnEditar) {
        await abrirEditarLiga(btnEditar.dataset.ligaId);
        return;
    }

    const btnFechar = evento.target.closest(".btn-fechar-inscricoes");
    if (btnFechar) {
        await fecharInscricoes(btnFechar.dataset.ligaId, btnFechar.dataset.ligaNome);
        return;
    }

    // Admin: clicou em "Montar Times"
    const btnMontar = evento.target.closest(".btn-montar-times");
    if (btnMontar) {
        await abrirDraft(
            btnMontar.dataset.ligaId,
            btnMontar.dataset.ligaNome,
            parseInt(btnMontar.dataset.ligaJogadores)
        );
        return;
    }

    // Admin: clicou em "Calendário e Placar"
    const btnCal = evento.target.closest(".btn-ver-calendario");
    if (btnCal) {
        await abrirCalendario(btnCal.dataset.ligaId, btnCal.dataset.ligaNome);
    }
});

// ════════════════════════════════════════════════════════════════
// FASE 2 — MODAL DE INSCRIÇÃO (jogador)
// ════════════════════════════════════════════════════════════════

btnFecharModal.addEventListener("click", fecharModal);

// Fecha ao clicar fora da caixa (no overlay escuro)
modalInscricao.addEventListener("click", (evento) => {
    if (evento.target === modalInscricao) fecharModal();
});

// ─────────────────────────────────────────────────────────────
// abrirModalInscricao(ligaId, ligaNome)
// Abre o modal, roda o checklist e verifica se já está inscrito
// ─────────────────────────────────────────────────────────────
async function abrirModalInscricao(ligaId, ligaNome) {
    ligaIdAtual = ligaId;

    // Reseta o modal para estado limpo a cada abertura
    modalLigaNome.textContent = ligaNome;
    checklistContainer.innerHTML = '<li class="checklist-carregando">Verificando perfil...</li>';
    estadoInscrito.classList.add("oculto");
    btnConfirmarInscricao.classList.add("oculto");
    btnConfirmarInscricao.disabled = false;
    btnConfirmarInscricao.textContent = "Confirmar Inscrição 🏀";

    modalInscricao.classList.remove("oculto");
    document.body.style.overflow = "hidden"; // impede scroll por baixo do modal

    // Verifica se já está inscrito antes de mostrar o checklist
    const jaInscrito = await verificarJaInscrito(ligaId, usuarioAtual.uid);

    if (jaInscrito) {
        checklistContainer.innerHTML = "";
        estadoInscrito.classList.remove("oculto");
        return;
    }

    // Monta o checklist de validação
    const { todosOk } = await renderizarChecklist(usuarioAtual);

    if (todosOk) {
        btnConfirmarInscricao.classList.remove("oculto");
    }
}

function fecharModal() {
    modalInscricao.classList.add("oculto");
    document.body.style.overflow = "";
    ligaIdAtual = null;
}

// ─────────────────────────────────────────────────────────────
// verificarJaInscrito(ligaId, uid)
// ─────────────────────────────────────────────────────────────
async function verificarJaInscrito(ligaId, uid) {
    try {
        const snap = await getDoc(doc(db, "ligas", ligaId, "inscricoes", uid));
        return snap.exists();
    } catch (erro) {
        console.error("Erro ao verificar inscrição:", erro);
        return false;
    }
}

// ─────────────────────────────────────────────────────────────
// renderizarChecklist(usuario)
// Verifica 3 condições e renderiza os itens visuais no modal.
// Retorna { todosOk: boolean }
// ─────────────────────────────────────────────────────────────
async function renderizarChecklist(usuario) {
    // Força o Firebase a buscar o estado mais recente do usuário.
    // Sem isso, emailVerified pode continuar false mesmo depois
    // que o usuário clicou no link de verificação, pois o Firebase
    // cacheia o token localmente.
    await usuario.reload();
    const usuarioAtualizado = auth.currentUser;

    // Lê posição no Firestore
    let posicao = "";
    try {
        const snap = await getDoc(doc(db, "users", usuarioAtualizado.uid));
        if (snap.exists()) posicao = snap.data().posicao || "";
    } catch (erro) {
        console.error("Erro ao ler perfil para checklist:", erro);
    }

    const itens = [
        // TODO: reativar verificação de e-mail antes de ir para produção
        // {
        //     ok:      usuarioAtualizado.emailVerified,
        //     label:   "E-mail verificado",
        //     detalhe: usuarioAtualizado.emailVerified
        //                  ? `Confirmado: ${usuarioAtualizado.email}`
        //                  : `Verifique a caixa de entrada de ${usuarioAtualizado.email}`,
        //     acaoHtml: !usuarioAtualizado.emailVerified
        //                   ? `<button class="btn-reenviar-email">Enviar link de verificação para ${usuarioAtualizado.email}</button>`
        //                   : ""
        // },
        {
            ok:      !!usuarioAtualizado.displayName,
            label:   "Nome preenchido",
            detalhe: usuarioAtualizado.displayName
                         ? `Seu nome: ${usuarioAtualizado.displayName}`
                         : "Acesse o Perfil e preencha seu nome.",
            acaoHtml: !usuarioAtualizado.displayName
                          ? `<a href="perfil.html" class="link-checklist">Ir para o Perfil →</a>`
                          : ""
        },
        {
            ok:      !!posicao,
            label:   "Posição definida",
            detalhe: posicao
                         ? `Sua posição: ${posicao}`
                         : "Acesse o Perfil e informe sua posição.",
            acaoHtml: !posicao
                          ? `<a href="perfil.html" class="link-checklist">Ir para o Perfil →</a>`
                          : ""
        }
    ];

    // Limpa o texto "Verificando..." e injeta os itens reais
    checklistContainer.innerHTML = "";

    itens.forEach(item => {
        const li = document.createElement("li");
        li.classList.add("checklist-item", item.ok ? "ok" : "pendente");
        li.innerHTML = `
            <span class="check-icone">${item.ok ? "✅" : "❌"}</span>
            <div class="check-texto">
                <strong>${item.label}</strong>
                <span>${item.detalhe}</span>
                ${item.acaoHtml}
            </div>
        `;
        checklistContainer.appendChild(li);
    });

    // Listener no botão de reenvio de e-mail (se existir)
    const btnReenviar = checklistContainer.querySelector(".btn-reenviar-email");
    if (btnReenviar) {
        btnReenviar.addEventListener("click", async () => {
            btnReenviar.disabled = true;
            btnReenviar.textContent = "Enviando...";
            try {
                // Sem actionCodeSettings: evita o erro unauthorized-continue-uri.
                // Após clicar no link do e-mail, o Firebase mostra a página padrão
                // dele confirmando a verificação. O jogador volta para o app manualmente.
                await sendEmailVerification(usuarioAtual);
                btnReenviar.textContent = "E-mail enviado! Verifique sua caixa.";
                mostrarFeedback("Link enviado! Após clicar no link, volte aqui e reabra o modal.", "sucesso");
            } catch (erro) {
                console.error("Erro ao enviar verificação:", erro.code, erro.message);

                if (erro.code === "auth/too-many-requests") {
                    mostrarFeedback("Limite atingido. Aguarde alguns minutos e tente de novo.", "erro");
                } else {
                    mostrarFeedback(`Erro: ${erro.message}`, "erro");
                }

                btnReenviar.disabled = false;
                btnReenviar.textContent = `Enviar link de verificação para ${usuarioAtual.email}`;
            }
        });
    }

    return { todosOk: itens.every(i => i.ok) };
}

// ─────────────────────────────────────────────────────────────
// Confirmar inscrição — listener no botão do modal
// ─────────────────────────────────────────────────────────────
btnConfirmarInscricao.addEventListener("click", async () => {
    if (!ligaIdAtual || !usuarioAtual) return;

    try {
        btnConfirmarInscricao.disabled = true;
        btnConfirmarInscricao.textContent = "Inscrevendo...";

        // Documento: ligas/{ligaId}/inscricoes/{uid}
        await setDoc(doc(db, "ligas", ligaIdAtual, "inscricoes", usuarioAtual.uid), {
            uid:         usuarioAtual.uid,
            nomeJogador: usuarioAtual.displayName || "Sem nome",
            email:       usuarioAtual.email,
            inscritoEm:  serverTimestamp(),
            timeId:      null // definido pelo admin no Draft (Fase 3)
        });

        checklistContainer.innerHTML = "";
        btnConfirmarInscricao.classList.add("oculto");
        estadoInscrito.classList.remove("oculto");

        mostrarFeedback("Inscrição confirmada! Boa sorte na liga 🏆", "sucesso");

    } catch (erro) {
        console.error("Erro ao confirmar inscrição:", erro);
        mostrarFeedback("Erro ao se inscrever. Tente novamente.", "erro");
        btnConfirmarInscricao.disabled = false;
        btnConfirmarInscricao.textContent = "Confirmar Inscrição 🏀";
    }
});

// ════════════════════════════════════════════════════════════════
// FASE 2 — ADMIN: fechar inscrições
// ════════════════════════════════════════════════════════════════

async function fecharInscricoes(ligaId, ligaNome) {
    const confirmado = confirm(
        `Fechar inscrições da liga "${ligaNome}"?\n\nOs jogadores não poderão mais se inscrever. O próximo passo é o Draft.`
    );
    if (!confirmado) return;

    try {
        mostrarFeedback("Fechando inscrições...", "info");
        await updateDoc(doc(db, "ligas", ligaId), { status: "draft" });
        mostrarFeedback(`Inscrições fechadas! Agora monte os times na Fase 3.`, "sucesso");
        await carregarLigasAdmin();
    } catch (erro) {
        console.error("Erro ao fechar inscrições:", erro);
        mostrarFeedback("Erro ao fechar inscrições. Tente novamente.", "erro");
    }
}

// ════════════════════════════════════════════════════════════════
// FASE 3 — DRAFT E FORMAÇÃO DE TIMES
// ════════════════════════════════════════════════════════════════

// Estado do draft em memória (descartado ao fechar o modal)
let draftState = {
    ligaId:          null,
    jogadoresPorTime: 0,
    inscritos:       [],  // lista de { uid, nomeJogador, posicao }
    times:           []   // [{ id, nome, cor, jogadores: [] }, ...]
};

// Referências ao modal de draft
const modalDraft      = document.getElementById("modal-draft");
const draftLigaNome   = document.getElementById("draft-liga-nome");
const btnFecharDraft  = document.getElementById("btn-fechar-draft");
const draftJogadores  = document.getElementById("draft-jogadores");
const draftTimesEl    = document.getElementById("draft-times");
const inputQtdTimes   = document.getElementById("draft-qtd-times");
const btnGerarTimes   = document.getElementById("btn-gerar-times");
const btnAutoDraft    = document.getElementById("btn-auto-draft");
const btnSalvarDraft  = document.getElementById("btn-salvar-draft");

btnFecharDraft.addEventListener("click", fecharDraft);
modalDraft.addEventListener("click", (e) => { if (e.target === modalDraft) fecharDraft(); });

// ─────────────────────────────────────────────────────────────
// abrirDraft(ligaId, ligaNome, jogadoresPorTime)
// Busca os inscritos e abre o modal de montagem de times
// ─────────────────────────────────────────────────────────────
async function abrirDraft(ligaId, ligaNome, jogadoresPorTime) {
    // Reseta o estado
    draftState = { ligaId, jogadoresPorTime, inscritos: [], times: [] };
    draftLigaNome.textContent = ligaNome;
    draftJogadores.innerHTML  = '<p class="draft-carregando">Carregando inscritos...</p>';
    draftTimesEl.innerHTML    = "";
    btnSalvarDraft.classList.add("oculto");
    inputQtdTimes.value       = "";

    modalDraft.classList.remove("oculto");
    document.body.style.overflow = "hidden";

    // Busca inscritos da liga no Firestore
    try {
        const snap = await getDocs(collection(db, "ligas", ligaId, "inscricoes"));

        if (snap.empty) {
            draftJogadores.innerHTML = '<p class="draft-carregando">Nenhum inscrito encontrado.</p>';
            return;
        }

        // Carrega posição de cada jogador do Firestore users/{uid}
        const promessas = snap.docs.map(async (d) => {
            const dados = d.data();
            let posicao = dados.posicao || "";
            if (!posicao) {
                // Busca no perfil se não estava na inscrição
                try {
                    const perfil = await getDoc(doc(db, "users", dados.uid));
                    if (perfil.exists()) posicao = perfil.data().posicao || "—";
                } catch (_) { posicao = "—"; }
            }
            return { uid: dados.uid, nomeJogador: dados.nomeJogador, posicao };
        });

        draftState.inscritos = await Promise.all(promessas);
        renderizarChipsJogadores();

    } catch (erro) {
        console.error("Erro ao carregar inscritos:", erro);
        draftJogadores.innerHTML = '<p class="draft-carregando">Erro ao carregar inscritos.</p>';
    }
}

function fecharDraft() {
    modalDraft.classList.add("oculto");
    document.body.style.overflow = "";
}

// ─────────────────────────────────────────────────────────────
// renderizarChipsJogadores()
// Mostra os chips dos jogadores que ainda não foram alocados
// ─────────────────────────────────────────────────────────────
function renderizarChipsJogadores() {
    // Quais UIDs já estão em algum time?
    const alocados = new Set(draftState.times.flatMap(t => t.jogadores.map(j => j.uid)));

    draftJogadores.innerHTML = "";

    draftState.inscritos.forEach(jogador => {
        if (alocados.has(jogador.uid)) return; // já alocado, não mostra

        const chip = document.createElement("div");
        chip.classList.add("chip-jogador");
        chip.dataset.uid      = jogador.uid;
        chip.dataset.nome     = jogador.nomeJogador;
        chip.dataset.posicao  = jogador.posicao;
        chip.innerHTML = `
            <span class="chip-nome">${jogador.nomeJogador}</span>
            <span class="chip-posicao">${jogador.posicao}</span>
        `;

        chip.addEventListener("click", () => selecionarJogador(jogador));
        draftJogadores.appendChild(chip);
    });

    if (draftJogadores.children.length === 0) {
        draftJogadores.innerHTML = '<p class="draft-carregando">✅ Todos os jogadores foram alocados!</p>';
    }
}

// Jogador selecionado — fica destacado aguardando clique no time
let jogadorSelecionado = null;

function selecionarJogador(jogador) {
    jogadorSelecionado = jogador;

    // Destaca o chip selecionado e deseleciona os outros
    draftJogadores.querySelectorAll(".chip-jogador").forEach(c => {
        c.classList.toggle("selecionado", c.dataset.uid === jogador.uid);
    });

    // Dá uma dica visual nos cards de time
    draftTimesEl.querySelectorAll(".card-time").forEach(c => {
        c.classList.add("esperando-jogador");
    });
}

// ─────────────────────────────────────────────────────────────
// btnGerarTimes — cria N times vazios conforme o input
// ─────────────────────────────────────────────────────────────
btnGerarTimes.addEventListener("click", () => {
    const qtd = parseInt(inputQtdTimes.value);
    if (isNaN(qtd) || qtd < 2 || qtd > 16) {
        mostrarFeedback("Informe entre 2 e 16 times.", "erro");
        return;
    }

    // Nomes e cores padrão para os times
    const nomes = ["Time A","Time B","Time C","Time D","Time E","Time F",
                   "Time G","Time H","Time I","Time J","Time K","Time L",
                   "Time M","Time N","Time O","Time P"];
    const cores = ["#e74c3c","#3498db","#2ecc71","#f39c12","#9b59b6",
                   "#1abc9c","#e67e22","#e91e63","#00bcd4","#8bc34a",
                   "#ff5722","#607d8b","#673ab7","#795548","#ff9800","#009688"];

    draftState.times = Array.from({ length: qtd }, (_, i) => ({
        id:        `time-${i}`,
        nome:      nomes[i],
        cor:       cores[i % cores.length],
        jogadores: []
    }));

    renderizarCardsTimes();
    btnSalvarDraft.classList.remove("oculto");
});

// ─────────────────────────────────────────────────────────────
// renderizarCardsTimes()
// Desenha os cards dos times com os jogadores já alocados
// ─────────────────────────────────────────────────────────────
function renderizarCardsTimes() {
    draftTimesEl.innerHTML = "";

    draftState.times.forEach((time, idx) => {
        const vagas     = draftState.jogadoresPorTime - time.jogadores.length;
        const cheio     = vagas <= 0;

        const card = document.createElement("div");
        card.classList.add("card-time");
        card.dataset.timeIdx = idx;
        card.style.borderColor = time.cor;

        const listaJog = time.jogadores.map(j => `
            <div class="time-jogador">
                <span>${j.nomeJogador}</span>
                <span class="time-jogador-pos">${j.posicao}</span>
                <button class="btn-remover-jogador" data-time="${idx}" data-uid="${j.uid}" title="Remover">✕</button>
            </div>
        `).join("");

        card.innerHTML = `
            <div class="card-time-header" style="background:${time.cor}20; border-bottom: 2px solid ${time.cor}">
                <span class="card-time-nome">${time.nome}</span>
                <span class="card-time-vagas ${cheio ? "cheio" : ""}">${cheio ? "Cheio" : `${vagas} vaga(s)`}</span>
            </div>
            <div class="card-time-jogadores">
                ${listaJog || '<p class="time-vazio">Clique num jogador e depois aqui</p>'}
            </div>
        `;

        // Clique no card: adiciona jogador selecionado
        card.addEventListener("click", (e) => {
            // Ignora clique no botão de remover (tratado abaixo)
            if (e.target.closest(".btn-remover-jogador")) return;
            adicionarJogadorAoTime(idx);
        });

        draftTimesEl.appendChild(card);
    });

    // Listener global para remover jogador de um time
    draftTimesEl.querySelectorAll(".btn-remover-jogador").forEach(btn => {
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            const timeIdx = parseInt(btn.dataset.time);
            const uid     = btn.dataset.uid;
            removerJogadorDoTime(timeIdx, uid);
        });
    });
}

function adicionarJogadorAoTime(timeIdx) {
    if (!jogadorSelecionado) {
        mostrarFeedback("Selecione um jogador primeiro.", "info");
        return;
    }

    const time = draftState.times[timeIdx];
    if (time.jogadores.length >= draftState.jogadoresPorTime) {
        mostrarFeedback(`${time.nome} está cheio!`, "erro");
        return;
    }

    // Verifica se o jogador já está neste time
    if (time.jogadores.some(j => j.uid === jogadorSelecionado.uid)) return;

    time.jogadores.push(jogadorSelecionado);
    jogadorSelecionado = null;

    // Re-renderiza tudo para refletir o estado atualizado
    renderizarChipsJogadores();
    renderizarCardsTimes();
}

function removerJogadorDoTime(timeIdx, uid) {
    const time = draftState.times[timeIdx];
    time.jogadores = time.jogadores.filter(j => j.uid !== uid);
    renderizarChipsJogadores();
    renderizarCardsTimes();
}

// ─────────────────────────────────────────────────────────────
// btnAutoDraft — distribui jogadores automaticamente por posição
// Algoritmo: embaralha inscritos e distribui em round-robin,
// priorizando equilibrar as posições entre os times.
// ─────────────────────────────────────────────────────────────
btnAutoDraft.addEventListener("click", () => {
    const qtd = parseInt(inputQtdTimes.value);
    if (isNaN(qtd) || qtd < 2) {
        mostrarFeedback("Defina o número de times antes do Draft Automático.", "erro");
        return;
    }

    // Garante que os times existem
    if (draftState.times.length !== qtd) {
        btnGerarTimes.click(); // reusa a lógica de gerar times
    }

    // Reinicia todos os times vazios
    draftState.times.forEach(t => t.jogadores = []);

    // Agrupa inscritos por posição para tentar equilibrar
    const porPosicao = {};
    draftState.inscritos.forEach(j => {
        const pos = j.posicao || "—";
        if (!porPosicao[pos]) porPosicao[pos] = [];
        porPosicao[pos].push(j);
    });

    // Embaralha cada grupo (evita sempre mesma ordem)
    Object.values(porPosicao).forEach(grupo => {
        for (let i = grupo.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [grupo[i], grupo[j]] = [grupo[j], grupo[i]];
        }
    });

    // Distribui em round-robin por posição
    const fila = Object.values(porPosicao).flat();
    fila.forEach((jogador, i) => {
        const timeIdx = i % draftState.times.length;
        const time    = draftState.times[timeIdx];
        if (time.jogadores.length < draftState.jogadoresPorTime) {
            time.jogadores.push(jogador);
        }
    });

    renderizarChipsJogadores();
    renderizarCardsTimes();
    btnSalvarDraft.classList.remove("oculto");
    mostrarFeedback("Times gerados automaticamente! Ajuste se necessário.", "sucesso");
});

// ─────────────────────────────────────────────────────────────
// btnSalvarDraft — salva os times no Firestore e avança a liga
// Estrutura salva: ligas/{ligaId}/times/{timeId} com jogadores
// O uid de cada jogador em inscricoes/{uid} recebe o timeId
// ─────────────────────────────────────────────────────────────
btnSalvarDraft.addEventListener("click", async () => {
    if (draftState.times.length === 0) return;

    const confirmado = confirm(
        `Salvar ${draftState.times.length} times e avançar para a fase de jogos?\n\nIsso não poderá ser desfeito facilmente.`
    );
    if (!confirmado) return;

    try {
        btnSalvarDraft.disabled = true;
        btnSalvarDraft.textContent = "Salvando...";
        mostrarFeedback("Salvando times...", "info");

        const { writeBatch } = await import("https://www.gstatic.com/firebasejs/12.12.1/firebase-firestore.js");
        const batch = writeBatch(db);

        // Salva cada time como documento em ligas/{ligaId}/times/{timeId}
        draftState.times.forEach(time => {
            const ref = doc(db, "ligas", draftState.ligaId, "times", time.id);
            batch.set(ref, {
                nome:      time.nome,
                cor:       time.cor,
                jogadores: time.jogadores.map(j => ({ uid: j.uid, nomeJogador: j.nomeJogador, posicao: j.posicao }))
            });

            // Atualiza o timeId em cada inscrição
            time.jogadores.forEach(j => {
                const inscRef = doc(db, "ligas", draftState.ligaId, "inscricoes", j.uid);
                batch.update(inscRef, { timeId: time.id });
            });
        });

        // Avança status da liga para "ativo"
        batch.update(doc(db, "ligas", draftState.ligaId), { status: "ativo" });

        await batch.commit();

        // Gera o calendário round-robin com os times salvos
        await gerarCalendario(draftState.ligaId, draftState.times);

        mostrarFeedback("Times salvos! Liga está agora em andamento. 🏆", "sucesso");
        fecharDraft();
        await carregarLigasAdmin();

    } catch (erro) {
        console.error("Erro ao salvar draft:", erro);
        mostrarFeedback("Erro ao salvar times. Tente novamente.", "erro");
        btnSalvarDraft.disabled = false;
        btnSalvarDraft.textContent = "Salvar Times e Avançar para Jogos 🏆";
    }
});

// ════════════════════════════════════════════════════════════════
// EDITAR LIGA (admin)
// ════════════════════════════════════════════════════════════════

const modalEditarLiga    = document.getElementById("modal-editar-liga");
const btnFecharEditar    = document.getElementById("btn-fechar-editar");
const btnCancelarEdicao  = document.getElementById("btn-cancelar-edicao");
const btnSalvarEdicao    = document.getElementById("btn-salvar-edicao");
const editNome           = document.getElementById("edit-nome-liga");
const editDescricao      = document.getElementById("edit-descricao");
const editDataInicio     = document.getElementById("edit-data-inicio");
const editMaxTimes       = document.getElementById("edit-max-times");
const editJogadores      = document.getElementById("edit-jogadores-time");

let ligaEditandoId = null; // ID da liga que está sendo editada

btnFecharEditar.addEventListener("click", fecharEditarLiga);
btnCancelarEdicao.addEventListener("click", fecharEditarLiga);
modalEditarLiga.addEventListener("click", (e) => { if (e.target === modalEditarLiga) fecharEditarLiga(); });

// Abre o modal de edição pré-preenchido com os dados atuais da liga
async function abrirEditarLiga(ligaId) {
    try {
        const snap = await getDoc(doc(db, "ligas", ligaId));
        if (!snap.exists()) {
            mostrarFeedback("Liga não encontrada.", "erro");
            return;
        }

        const liga = snap.data();
        ligaEditandoId = ligaId;

        // Preenche os campos com os dados atuais
        editNome.value       = liga.nome        || "";
        editDescricao.value  = liga.descricao   || "";
        editDataInicio.value = liga.dataInicio   || "";
        editMaxTimes.value   = liga.maxTimes     || "";
        editJogadores.value  = liga.jogadoresPorTime || "";

        modalEditarLiga.classList.remove("oculto");
        document.body.style.overflow = "hidden";
        editNome.focus();

    } catch (erro) {
        console.error("Erro ao carregar liga para edição:", erro);
        mostrarFeedback("Erro ao abrir edição.", "erro");
    }
}

function fecharEditarLiga() {
    modalEditarLiga.classList.add("oculto");
    document.body.style.overflow = "";
    ligaEditandoId = null;
}

// Salva as alterações no Firestore
btnSalvarEdicao.addEventListener("click", async () => {
    if (!ligaEditandoId) return;

    const nome      = editNome.value.trim();
    const maxTimes  = parseInt(editMaxTimes.value);
    const jogadores = parseInt(editJogadores.value);

    if (!nome) {
        mostrarFeedback("O nome da liga é obrigatório.", "erro");
        editNome.focus();
        return;
    }
    if (isNaN(maxTimes) || maxTimes < 2 || maxTimes > 16) {
        mostrarFeedback("Máximo de times deve ser entre 2 e 16.", "erro");
        return;
    }
    if (isNaN(jogadores) || jogadores < 1 || jogadores > 12) {
        mostrarFeedback("Jogadores por time deve ser entre 1 e 12.", "erro");
        return;
    }

    try {
        btnSalvarEdicao.disabled = true;
        btnSalvarEdicao.textContent = "Salvando...";

        await updateDoc(doc(db, "ligas", ligaEditandoId), {
            nome:            nome,
            descricao:       editDescricao.value.trim(),
            dataInicio:      editDataInicio.value,
            maxTimes:        maxTimes,
            jogadoresPorTime: jogadores
        });

        mostrarFeedback("Liga atualizada com sucesso! ✅", "sucesso");
        fecharEditarLiga();
        await carregarLigasAdmin(); // recarrega os cards com os novos dados

    } catch (erro) {
        console.error("Erro ao salvar edição:", erro);
        mostrarFeedback("Erro ao salvar alterações.", "erro");
    } finally {
        btnSalvarEdicao.disabled = false;
        btnSalvarEdicao.textContent = "Salvar Alterações";
    }
});

// ════════════════════════════════════════════════════════════════
// FASE 4 — CALENDÁRIO ROUND-ROBIN, PLACAR E CLASSIFICAÇÃO
// ════════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────
// gerarCalendario(ligaId, times)
// Algoritmo round-robin clássico (rotação de times).
// Para N times → N-1 rodadas (N par) ou N rodadas (N ímpar).
// Cada rodada tem N/2 jogos (ou (N-1)/2 se ímpar).
// Salva em ligas/{ligaId}/jogos/{jogoId}.
// ─────────────────────────────────────────────────────────────
async function gerarCalendario(ligaId, times) {
    try {
        const { writeBatch: wb } = await import("https://www.gstatic.com/firebasejs/12.12.1/firebase-firestore.js");
        const batch = wb(db);

        // Algoritmo de rotação: fixa o primeiro, roda os demais
        const lista = [...times];
        let byeTime = null;

        // Se número ímpar de times, adiciona um "bye" (folga)
        if (lista.length % 2 !== 0) {
            byeTime = { id: "bye", nome: "Folga", cor: "#555" };
            lista.push(byeTime);
        }

        const n       = lista.length;
        const rodadas = n - 1;

        for (let r = 0; r < rodadas; r++) {
            for (let i = 0; i < n / 2; i++) {
                const timeA = lista[i];
                const timeB = lista[n - 1 - i];

                // Pula jogos contra "bye"
                if (timeA.id === "bye" || timeB.id === "bye") continue;

                const jogoRef = doc(collection(db, "ligas", ligaId, "jogos"));
                batch.set(jogoRef, {
                    rodada:  r + 1,
                    timeA:   { id: timeA.id, nome: timeA.nome, cor: timeA.cor },
                    timeB:   { id: timeB.id, nome: timeB.nome, cor: timeB.cor },
                    placarA: null,
                    placarB: null,
                    status:  "pendente"
                });
            }

            // Rotaciona: fixa lista[0], rotaciona lista[1..n-1]
            const ultimo = lista.pop();
            lista.splice(1, 0, ultimo);
        }

        await batch.commit();
        console.log(`Calendário gerado: ${rodadas} rodadas para ${times.length} times.`);

    } catch (erro) {
        console.error("Erro ao gerar calendário:", erro);
        mostrarFeedback("Times salvos, mas erro ao gerar calendário.", "info");
    }
}

// ─────────────────────────────────────────────────────────────
// Estado do modal de calendário
// ─────────────────────────────────────────────────────────────
let calState = {
    ligaId:     null,
    ligaNome:   "",
    ehAdmin:    false,
    jogos:      [],           // documentos de jogos
    jogoAtivo:  null          // jogo selecionado para registrar placar
};

// Referências
const modalCalendario  = document.getElementById("modal-calendario");
const calLigaNome      = document.getElementById("cal-liga-nome");
const btnFecharCal     = document.getElementById("btn-fechar-cal");
const calJogosEl       = document.getElementById("cal-jogos");
const calClassEl       = document.getElementById("cal-classificacao");
const calTimesEl       = document.getElementById("cal-times");
const calTabs          = document.querySelectorAll(".cal-tab");
const calTabAdmin      = document.querySelector(".cal-tab-admin");

// Modal de placar
const modalPlacar      = document.getElementById("modal-placar");
const btnFecharPlacar  = document.getElementById("btn-fechar-placar");
const placarConfrontoEl = document.getElementById("placar-confronto");
const labelPlacarA     = document.getElementById("label-placar-a");
const labelPlacarB     = document.getElementById("label-placar-b");
const inputPlacarA     = document.getElementById("input-placar-a");
const inputPlacarB     = document.getElementById("input-placar-b");
const btnSalvarPlacar  = document.getElementById("btn-salvar-placar");

btnFecharCal.addEventListener("click", fecharCalendario);
modalCalendario.addEventListener("click", (e) => { if (e.target === modalCalendario) fecharCalendario(); });
btnFecharPlacar.addEventListener("click", fecharModalPlacar);
modalPlacar.addEventListener("click", (e) => { if (e.target === modalPlacar) fecharModalPlacar(); });

// Troca de abas
calTabs.forEach(tab => {
    tab.addEventListener("click", () => {
        calTabs.forEach(t => t.classList.remove("ativo"));
        tab.classList.add("ativo");

        calJogosEl.classList.add("oculto");
        calClassEl.classList.add("oculto");
        calTimesEl.classList.add("oculto");

        if (tab.dataset.tab === "jogos") {
            calJogosEl.classList.remove("oculto");
        } else if (tab.dataset.tab === "classificacao") {
            calClassEl.classList.remove("oculto");
            renderizarClassificacao();
        } else if (tab.dataset.tab === "times") {
            calTimesEl.classList.remove("oculto");
            carregarTimesParaEditar();
        }
    });
});

// ─────────────────────────────────────────────────────────────
// abrirCalendario(ligaId, ligaNome)
// Carrega todos os jogos e abre o modal
// ─────────────────────────────────────────────────────────────
async function abrirCalendario(ligaId, ligaNome) {
    calState.ligaId   = ligaId;
    calState.ligaNome = ligaNome;
    calState.ehAdmin  = roleAtual === "admin"; // usa roleAtual (Firestore), não usuarioAtual.role (Auth)

    calLigaNome.textContent = `📅 ${ligaNome}`;
    calJogosEl.innerHTML    = '<p class="draft-carregando">Carregando jogos...</p>';
    calClassEl.innerHTML    = '<p class="draft-carregando">Calculando...</p>';
    calTimesEl.innerHTML    = '<p class="draft-carregando">Carregando times...</p>';

    // Mostra/oculta a aba de times conforme o role
    if (calState.ehAdmin) {
        calTabAdmin.classList.remove("oculto");
    } else {
        calTabAdmin.classList.add("oculto");
    }

    // Garante que a aba "Jogos" está ativa ao abrir
    calTabs.forEach(t => t.classList.toggle("ativo", t.dataset.tab === "jogos"));
    calJogosEl.classList.remove("oculto");
    calClassEl.classList.add("oculto");
    calTimesEl.classList.add("oculto");

    modalCalendario.classList.remove("oculto");
    document.body.style.overflow = "hidden";

    try {
        const q    = query(collection(db, "ligas", ligaId, "jogos"), orderBy("rodada"));
        const snap = await getDocs(q);

        calState.jogos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderizarJogos();

    } catch (erro) {
        console.error("Erro ao carregar jogos:", erro);
        calJogosEl.innerHTML = '<p class="draft-carregando">Erro ao carregar jogos.</p>';
    }
}

function fecharCalendario() {
    modalCalendario.classList.add("oculto");
    document.body.style.overflow = "";
}

// ─────────────────────────────────────────────────────────────
// renderizarJogos()
// Agrupa jogos por rodada e renderiza no modal
// ─────────────────────────────────────────────────────────────
function renderizarJogos() {
    calJogosEl.innerHTML = "";

    // Botão "Novo Confronto" só aparece para o admin
    if (calState.ehAdmin) {
        const btnNovo = document.createElement("button");
        btnNovo.className = "btn-novo-confronto";
        btnNovo.textContent = "➕ Novo Confronto";
        btnNovo.addEventListener("click", abrirNovoJogo);
        calJogosEl.appendChild(btnNovo);
    }

    if (calState.jogos.length === 0) {
        calJogosEl.insertAdjacentHTML("beforeend", '<p class="draft-carregando">Nenhum jogo cadastrado.</p>');
        return;
    }

    // Agrupa por rodada
    const porRodada = {};
    calState.jogos.forEach(jogo => {
        if (!porRodada[jogo.rodada]) porRodada[jogo.rodada] = [];
        porRodada[jogo.rodada].push(jogo);
    });

    Object.keys(porRodada).sort((a, b) => +a - +b).forEach(rodada => {
        const secao = document.createElement("div");
        secao.classList.add("cal-rodada");

        const jogosHTML = porRodada[rodada].map(jogo => {
            const finalizado = jogo.status === "finalizado";
            const cancelado  = jogo.status === "cancelado";
            const adiado     = jogo.status === "adiado";

            const placarTexto = finalizado
                ? `<span class="jogo-placar">${jogo.placarA} <span class="placar-sep">×</span> ${jogo.placarB}</span>`
                : cancelado
                    ? `<span class="jogo-status-tag cancelado">❌ Cancelado</span>`
                    : adiado
                        ? `<span class="jogo-status-tag adiado">📅 Adiado</span>`
                        : `<span class="jogo-pendente">⏳ Pendente</span>`;

            // Linha com data, hora e local (se preenchidos)
            const dataHora = jogo.data || jogo.hora
                ? `<div class="jogo-meta">
                       ${jogo.data ? `📅 ${jogo.data.split("-").reverse().join("/")}` : ""}
                       ${jogo.hora ? `⏰ ${jogo.hora}` : ""}
                       ${jogo.local ? `📍 ${jogo.local}` : ""}
                   </div>`
                : "";

            const obs = jogo.obs
                ? `<div class="jogo-obs">💬 ${jogo.obs}</div>`
                : "";

            const btnsAdmin = calState.ehAdmin
                ? `<div class="jogo-btns-admin">
                       ${!finalizado && !cancelado ? `<button class="btn-registrar-placar" data-jogo-id="${jogo.id}">✏️ Placar</button>` : ""}
                       <button class="btn-editar-jogo" data-jogo-id="${jogo.id}">⚙️ Editar</button>
                   </div>`
                : "";

            const vencedorA = finalizado && jogo.placarA > jogo.placarB ? "vencedor" : "";
            const vencedorB = finalizado && jogo.placarB > jogo.placarA ? "vencedor" : "";

            return `
                <div class="card-jogo ${finalizado ? "finalizado" : ""} ${cancelado ? "cancelado" : ""} ${adiado ? "adiado" : ""}">
                    <div class="jogo-times">
                        <span class="jogo-time ${vencedorA}" style="border-left: 3px solid ${jogo.timeA.cor}">
                            ${jogo.timeA.nome}
                        </span>
                        ${placarTexto}
                        <span class="jogo-time ${vencedorB}" style="border-right: 3px solid ${jogo.timeB.cor}; text-align:right">
                            ${jogo.timeB.nome}
                        </span>
                    </div>
                    ${dataHora}
                    ${obs}
                    ${btnsAdmin}
                </div>
            `;
        }).join("");

        secao.innerHTML = `
            <h4 class="cal-rodada-titulo">Rodada ${rodada}</h4>
            <div class="cal-jogos-lista">${jogosHTML}</div>
        `;

        calJogosEl.appendChild(secao);
    });

    // Listener por delegação nos botões do card de jogo
    calJogosEl.querySelectorAll(".btn-registrar-placar").forEach(btn => {
        btn.addEventListener("click", () => {
            const jogo = calState.jogos.find(j => j.id === btn.dataset.jogoId);
            if (jogo) abrirModalPlacar(jogo);
        });
    });

    calJogosEl.querySelectorAll(".btn-editar-jogo").forEach(btn => {
        btn.addEventListener("click", () => {
            const jogo = calState.jogos.find(j => j.id === btn.dataset.jogoId);
            if (jogo) abrirEditarJogo(jogo);
        });
    });
}

// ─────────────────────────────────────────────────────────────
// renderizarClassificacao()
// Calcula pontos a partir dos jogos e exibe a tabela
// Vitória = 2pts, Derrota = 1pt
// ─────────────────────────────────────────────────────────────
function renderizarClassificacao() {
    // Coleta todos os times únicos dos jogos
    const times = {};

    calState.jogos.forEach(jogo => {
        [jogo.timeA, jogo.timeB].forEach(t => {
            if (!times[t.id]) {
                times[t.id] = { nome: t.nome, cor: t.cor, j: 0, v: 0, d: 0, pts: 0, cestas: 0, cestasSofridas: 0 };
            }
        });
    });

    // Calcula resultado de cada jogo finalizado
    calState.jogos.filter(j => j.status === "finalizado").forEach(jogo => {
        const a = times[jogo.timeA.id];
        const b = times[jogo.timeB.id];
        if (!a || !b) return;

        a.j++; b.j++;
        a.cestas += jogo.placarA;    a.cestasSofridas += jogo.placarB;
        b.cestas += jogo.placarB;    b.cestasSofridas += jogo.placarA;

        if (jogo.placarA > jogo.placarB) {
            a.v++; a.pts += 2;
            b.d++; b.pts += 1;
        } else if (jogo.placarB > jogo.placarA) {
            b.v++; b.pts += 2;
            a.d++; a.pts += 1;
        } else {
            // Empate (raro em basquete, mas previsto)
            a.v++; a.pts += 2;
            b.v++; b.pts += 2;
        }
    });

    // Ordena: pts desc → saldo de cestas desc → cestas feitas desc
    const ordenado = Object.values(times).sort((x, y) => {
        if (y.pts !== x.pts)  return y.pts - x.pts;
        const saldoX = x.cestas - x.cestasSofridas;
        const saldoY = y.cestas - y.cestasSofridas;
        if (saldoY !== saldoX) return saldoY - saldoX;
        return y.cestas - x.cestas;
    });

    if (ordenado.length === 0) {
        calClassEl.innerHTML = '<p class="draft-carregando">Nenhum time encontrado.</p>';
        return;
    }

    const linhas = ordenado.map((t, i) => `
        <tr class="${i === 0 ? "lider" : ""}">
            <td class="class-pos">${i + 1}º</td>
            <td class="class-time">
                <span class="class-cor" style="background:${t.cor}"></span>
                ${t.nome}
            </td>
            <td>${t.j}</td>
            <td class="v">${t.v}</td>
            <td class="d">${t.d}</td>
            <td>${t.cestas - t.cestasSofridas >= 0 ? "+" : ""}${t.cestas - t.cestasSofridas}</td>
            <td class="pts">${t.pts}</td>
        </tr>
    `).join("");

    calClassEl.innerHTML = `
        <table class="tabela-classificacao">
            <thead>
                <tr>
                    <th>#</th>
                    <th>Time</th>
                    <th title="Jogos">J</th>
                    <th title="Vitórias" class="v">V</th>
                    <th title="Derrotas" class="d">D</th>
                    <th title="Saldo de Cestas">SC</th>
                    <th title="Pontos" class="pts">Pts</th>
                </tr>
            </thead>
            <tbody>${linhas}</tbody>
        </table>
        <p class="class-legenda">V=2pts · D=1pt · Critério: Pts → Saldo de cestas</p>
    `;
}

// ─────────────────────────────────────────────────────────────
// Modal de Placar — registrar resultado de um jogo
// ─────────────────────────────────────────────────────────────
function abrirModalPlacar(jogo) {
    calState.jogoAtivo = jogo;

    placarConfrontoEl.innerHTML = `
        <span class="confronto-time" style="color:${jogo.timeA.cor}">${jogo.timeA.nome}</span>
        <span class="confronto-vs">×</span>
        <span class="confronto-time" style="color:${jogo.timeB.cor}">${jogo.timeB.nome}</span>
    `;
    labelPlacarA.textContent = jogo.timeA.nome;
    labelPlacarB.textContent = jogo.timeB.nome;
    inputPlacarA.value = "";
    inputPlacarB.value = "";

    modalPlacar.classList.remove("oculto");
}

function fecharModalPlacar() {
    modalPlacar.classList.add("oculto");
    calState.jogoAtivo = null;
}

btnSalvarPlacar.addEventListener("click", async () => {
    const jogo    = calState.jogoAtivo;
    if (!jogo) return;

    const pA = parseInt(inputPlacarA.value);
    const pB = parseInt(inputPlacarB.value);

    if (isNaN(pA) || isNaN(pB) || pA < 0 || pB < 0) {
        mostrarFeedback("Informe placares válidos (números ≥ 0).", "erro");
        return;
    }

    try {
        btnSalvarPlacar.disabled  = true;
        btnSalvarPlacar.textContent = "Salvando...";

        await updateDoc(doc(db, "ligas", calState.ligaId, "jogos", jogo.id), {
            placarA: pA,
            placarB: pB,
            status:  "finalizado"
        });

        // Atualiza localmente para não precisar recarregar do Firebase
        const jogoLocal = calState.jogos.find(j => j.id === jogo.id);
        if (jogoLocal) {
            jogoLocal.placarA = pA;
            jogoLocal.placarB = pB;
            jogoLocal.status  = "finalizado";
        }

        fecharModalPlacar();
        renderizarJogos();
        mostrarFeedback("Resultado registrado! ✅", "sucesso");

    } catch (erro) {
        console.error("Erro ao salvar placar:", erro);
        mostrarFeedback("Erro ao salvar resultado.", "erro");
    } finally {
        btnSalvarPlacar.disabled = false;
        btnSalvarPlacar.textContent = "Salvar Resultado ✅";
    }
});

// ─────────────────────────────────────────────────────────────
// ABA TIMES — editar nomes, mover jogadores entre times
// ─────────────────────────────────────────────────────────────

let timesCarregados = []; // [{id, nome, cor, jogadores:[]}]

async function carregarTimesParaEditar() {
    calTimesEl.innerHTML = '<p class="draft-carregando">Carregando times...</p>';

    try {
        const snap = await getDocs(collection(db, "ligas", calState.ligaId, "times"));
        if (snap.empty) {
            calTimesEl.innerHTML = '<p class="draft-carregando">Nenhum time encontrado.</p>';
            return;
        }

        timesCarregados = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderizarTimesEditor();

    } catch (erro) {
        console.error("Erro ao carregar times:", erro);
        calTimesEl.innerHTML = '<p class="draft-carregando">Erro ao carregar times.</p>';
    }
}

function renderizarTimesEditor() {
    calTimesEl.innerHTML = "";

    const cardsHTML = timesCarregados.map((time, tIdx) => {
        // Opções para mover jogador: todos os outros times
        const opcoesMove = timesCarregados
            .filter((_, i) => i !== tIdx)
            .map(t => `<option value="${t.id}">${t.nome}</option>`)
            .join("");

        const jogadoresHTML = time.jogadores.map(j => `
            <div class="editor-jogador">
                <span class="editor-jogador-nome">${j.nomeJogador}</span>
                <span class="chip-posicao">${j.posicao || "—"}</span>
                <select class="form-select select-mover" data-uid="${j.uid}" data-time-id="${time.id}">
                    <option value="">Mover para...</option>
                    ${opcoesMove}
                </select>
            </div>
        `).join("") || '<p class="time-vazio">Time sem jogadores</p>';

        return `
            <div class="editor-time-card" style="border-color:${time.cor}">
                <div class="editor-time-header" style="background:${time.cor}20; border-bottom:2px solid ${time.cor}">
                    <input class="editor-time-nome form-input" type="text"
                           value="${time.nome}" data-time-id="${time.id}" maxlength="30"
                           placeholder="Nome do time">
                </div>
                <div class="editor-time-jogadores">
                    ${jogadoresHTML}
                </div>
            </div>
        `;
    }).join("");

    calTimesEl.innerHTML = `
        <p class="draft-secao-titulo" style="margin-bottom:10px">
            Edite os nomes dos times e mova jogadores entre eles.
        </p>
        <div class="editor-times-grid">${cardsHTML}</div>
        <button id="btn-salvar-times" class="btn-primario" style="margin-top:18px">
            Salvar Alterações dos Times ✅
        </button>
    `;

    // Listener: mover jogador ao trocar o select
    calTimesEl.querySelectorAll(".select-mover").forEach(sel => {
        sel.addEventListener("change", () => {
            const destinoId = sel.value;
            if (!destinoId) return;

            const uid        = sel.dataset.uid;
            const origemId   = sel.dataset.timeId;
            const origem     = timesCarregados.find(t => t.id === origemId);
            const destino    = timesCarregados.find(t => t.id === destinoId);
            if (!origem || !destino) return;

            const jogadorIdx = origem.jogadores.findIndex(j => j.uid === uid);
            if (jogadorIdx === -1) return;

            const [jogador] = origem.jogadores.splice(jogadorIdx, 1);
            destino.jogadores.push(jogador);

            renderizarTimesEditor(); // re-renderiza refletindo a mudança
        });
    });

    // Listener: salvar tudo
    document.getElementById("btn-salvar-times").addEventListener("click", salvarTimesEditados);
}

async function salvarTimesEditados() {
    const btn = document.getElementById("btn-salvar-times");
    btn.disabled = true;
    btn.textContent = "Salvando...";

    try {
        // Lê os nomes atuais dos inputs antes de salvar
        calTimesEl.querySelectorAll(".editor-time-nome").forEach(input => {
            const time = timesCarregados.find(t => t.id === input.dataset.timeId);
            if (time) time.nome = input.value.trim() || time.nome;
        });

        const { writeBatch: wb } = await import("https://www.gstatic.com/firebasejs/12.12.1/firebase-firestore.js");
        const batch = wb(db);

        timesCarregados.forEach(time => {
            batch.update(doc(db, "ligas", calState.ligaId, "times", time.id), {
                nome:      time.nome,
                jogadores: time.jogadores
            });
        });

        await batch.commit();

        mostrarFeedback("Times atualizados! ✅", "sucesso");
        renderizarTimesEditor();

    } catch (erro) {
        console.error("Erro ao salvar times:", erro);
        mostrarFeedback("Erro ao salvar times.", "erro");
        btn.disabled = false;
        btn.textContent = "Salvar Alterações dos Times ✅";
    }
}

// ─────────────────────────────────────────────────────────────
// EDITAR JOGO — reagendar data, hora, local, obs, status
// ─────────────────────────────────────────────────────────────
const modalEditarJogo       = document.getElementById("modal-editar-jogo");
const btnFecharEditarJogo   = document.getElementById("btn-fechar-editar-jogo");
const btnCancelarEditarJogo = document.getElementById("btn-cancelar-editar-jogo");
const btnSalvarEditarJogo   = document.getElementById("btn-salvar-editar-jogo");
const editarJogoConfrontoEl = document.getElementById("editar-jogo-confronto");
const editarJogoData        = document.getElementById("editar-jogo-data");
const editarJogoHora        = document.getElementById("editar-jogo-hora");
const editarJogoLocal       = document.getElementById("editar-jogo-local");
const editarJogoObs         = document.getElementById("editar-jogo-obs");
const editarJogoStatus      = document.getElementById("editar-jogo-status");

let jogoEditandoId = null;

btnFecharEditarJogo.addEventListener("click", fecharEditarJogo);
btnCancelarEditarJogo.addEventListener("click", fecharEditarJogo);
modalEditarJogo.addEventListener("click", (e) => { if (e.target === modalEditarJogo) fecharEditarJogo(); });

function abrirEditarJogo(jogo) {
    jogoEditandoId = jogo.id;

    // Mostra o confronto (só leitura)
    editarJogoConfrontoEl.innerHTML = `
        <span class="confronto-time" style="color:${jogo.timeA.cor}">${jogo.timeA.nome}</span>
        <span class="confronto-vs">×</span>
        <span class="confronto-time" style="color:${jogo.timeB.cor}">${jogo.timeB.nome}</span>
    `;

    // Pré-preenche com os dados já salvos (ou vazio se for a primeira vez)
    editarJogoData.value   = jogo.data   || "";
    editarJogoHora.value   = jogo.hora   || "";
    editarJogoLocal.value  = jogo.local  || "";
    editarJogoObs.value    = jogo.obs    || "";
    editarJogoStatus.value = jogo.status || "pendente";

    modalEditarJogo.classList.remove("oculto");
}

function fecharEditarJogo() {
    modalEditarJogo.classList.add("oculto");
    jogoEditandoId = null;
}

btnSalvarEditarJogo.addEventListener("click", async () => {
    if (!jogoEditandoId) return;

    try {
        btnSalvarEditarJogo.disabled = true;
        btnSalvarEditarJogo.textContent = "Salvando...";

        const atualizacao = {
            data:   editarJogoData.value  || null,
            hora:   editarJogoHora.value  || null,
            local:  editarJogoLocal.value.trim() || null,
            obs:    editarJogoObs.value.trim()   || null,
            status: editarJogoStatus.value
        };

        // Se voltou para pendente/adiado/cancelado, limpa o placar
        if (["pendente", "adiado", "cancelado"].includes(atualizacao.status)) {
            atualizacao.placarA = null;
            atualizacao.placarB = null;
        }

        await updateDoc(doc(db, "ligas", calState.ligaId, "jogos", jogoEditandoId), atualizacao);

        // Atualiza localmente para evitar reload completo
        const jogoLocal = calState.jogos.find(j => j.id === jogoEditandoId);
        if (jogoLocal) Object.assign(jogoLocal, atualizacao);

        fecharEditarJogo();
        renderizarJogos();
        mostrarFeedback("Jogo atualizado! ✅", "sucesso");

    } catch (erro) {
        console.error("Erro ao editar jogo:", erro);
        mostrarFeedback("Erro ao salvar alterações.", "erro");
    } finally {
        btnSalvarEditarJogo.disabled = false;
        btnSalvarEditarJogo.textContent = "Salvar Alterações";
    }
});

// ════════════════════════════════════════════════════════════════
// NOVO CONFRONTO — criar jogo manualmente em qualquer rodada
// ════════════════════════════════════════════════════════════════

const modalNovoJogo      = document.getElementById("modal-novo-jogo");
const btnFecharNovoJogo  = document.getElementById("btn-fechar-novo-jogo");
const btnCancelarNovoJogo = document.getElementById("btn-cancelar-novo-jogo");
const btnSalvarNovoJogo  = document.getElementById("btn-salvar-novo-jogo");
const novoJogoRodada     = document.getElementById("novo-jogo-rodada");
const novoJogoTimeA      = document.getElementById("novo-jogo-time-a");
const novoJogoTimeB      = document.getElementById("novo-jogo-time-b");
const novoJogoData       = document.getElementById("novo-jogo-data");
const novoJogoHora       = document.getElementById("novo-jogo-hora");
const novoJogoLocal      = document.getElementById("novo-jogo-local");
const novoJogoObs        = document.getElementById("novo-jogo-obs");

btnFecharNovoJogo.addEventListener("click", fecharNovoJogo);
btnCancelarNovoJogo.addEventListener("click", fecharNovoJogo);
modalNovoJogo.addEventListener("click", (e) => { if (e.target === modalNovoJogo) fecharNovoJogo(); });

// Abre o modal e carrega os times nos selects
async function abrirNovoJogo() {
    // Limpa os campos
    novoJogoRodada.value = "";
    novoJogoData.value   = "";
    novoJogoHora.value   = "";
    novoJogoLocal.value  = "";
    novoJogoObs.value    = "";

    // Sugestão de rodada: próxima após a última cadastrada
    if (calState.jogos.length > 0) {
        const maxRodada = Math.max(...calState.jogos.map(j => +j.rodada || 0));
        novoJogoRodada.value = maxRodada;
    } else {
        novoJogoRodada.value = 1;
    }

    // Carrega times (reusa os já carregados ou busca no Firestore)
    let times = timesCarregados;
    if (!times || times.length === 0) {
        try {
            const snap = await getDocs(collection(db, "ligas", calState.ligaId, "times"));
            times = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            timesCarregados = times;
        } catch (e) {
            mostrarFeedback("Erro ao carregar times.", "erro");
            return;
        }
    }

    // Popula os selects com os times da liga
    const opcoesHTML = times.map(t =>
        `<option value="${t.id}" data-cor="${t.cor}" data-nome="${t.nome}">${t.nome}</option>`
    ).join("");

    novoJogoTimeA.innerHTML = `<option value="">Selecione o Time A...</option>${opcoesHTML}`;
    novoJogoTimeB.innerHTML = `<option value="">Selecione o Time B...</option>${opcoesHTML}`;

    modalNovoJogo.classList.remove("oculto");
    document.body.style.overflow = "hidden";
}

function fecharNovoJogo() {
    modalNovoJogo.classList.add("oculto");
}

btnSalvarNovoJogo.addEventListener("click", async () => {
    // Validações básicas
    const rodada = parseInt(novoJogoRodada.value);
    if (!rodada || rodada < 1) {
        mostrarFeedback("Informe um número de rodada válido.", "erro");
        return;
    }
    if (!novoJogoTimeA.value || !novoJogoTimeB.value) {
        mostrarFeedback("Selecione os dois times.", "erro");
        return;
    }
    if (novoJogoTimeA.value === novoJogoTimeB.value) {
        mostrarFeedback("Os dois times não podem ser iguais.", "erro");
        return;
    }

    // Monta objetos dos times a partir dos selects
    const optA = novoJogoTimeA.selectedOptions[0];
    const optB = novoJogoTimeB.selectedOptions[0];

    const timeAObj = { id: optA.value, nome: optA.dataset.nome, cor: optA.dataset.cor };
    const timeBObj = { id: optB.value, nome: optB.dataset.nome, cor: optB.dataset.cor };

    const novoJogo = {
        rodada,
        timeA:   timeAObj,
        timeB:   timeBObj,
        data:    novoJogoData.value   || null,
        hora:    novoJogoHora.value   || null,
        local:   novoJogoLocal.value.trim()  || null,
        obs:     novoJogoObs.value.trim()    || null,
        status:  "pendente",
        placarA: null,
        placarB: null,
        criadoEm: serverTimestamp()
    };

    try {
        btnSalvarNovoJogo.disabled = true;
        btnSalvarNovoJogo.textContent = "Criando...";

        // Salva no Firestore
        const docRef = await addDoc(
            collection(db, "ligas", calState.ligaId, "jogos"),
            novoJogo
        );

        // Adiciona ao estado local para re-renderizar sem reload completo
        calState.jogos.push({ id: docRef.id, ...novoJogo });

        fecharNovoJogo();
        renderizarJogos();
        mostrarFeedback(`Confronto criado na Rodada ${rodada}! ✅`, "sucesso");

    } catch (erro) {
        console.error("Erro ao criar confronto:", erro);
        mostrarFeedback("Erro ao criar o confronto.", "erro");
    } finally {
        btnSalvarNovoJogo.disabled = false;
        btnSalvarNovoJogo.textContent = "Criar Confronto ✅";
    }
});

// ════════════════════════════════════════════════════════════════
// UTILITÁRIOS
// ════════════════════════════════════════════════════════════════

async function lerRole(uid) {
    try {
        const snap = await getDoc(doc(db, "users", uid));
        if (snap.exists() && snap.data().role) return snap.data().role;
        return "jogador";
    } catch (erro) {
        console.error("Erro ao ler role:", erro);
        return "jogador";
    }
}

function fecharFormulario() {
    formNovaLiga.classList.add("oculto");
    btnAbrirForm.classList.remove("oculto");
    inputNome.value       = "";
    inputDescricao.value  = "";
    inputDataInicio.value = "";
    inputMaxTimes.value   = "";
    inputJogadores.value  = "";
}

let feedbackTimer = null;

function mostrarFeedback(mensagem, tipo) {
    msgFeedback.textContent = mensagem;
    msgFeedback.className   = `msg-feedback ${tipo}`;
    msgFeedback.classList.remove("oculto");

    if (feedbackTimer) clearTimeout(feedbackTimer);

    if (tipo !== "info") {
        feedbackTimer = setTimeout(() => {
            msgFeedback.classList.add("oculto");
        }, 4000);
    }
}
