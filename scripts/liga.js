// ─────────────────────────────────────────────────────────────
// liga.js — Fase 1 + Fase 2
//
// Fase 1: Filtro de acesso (admin/jogador), criar liga, listar ligas
// Fase 2: Checklist de inscrição, validação de e-mail, confirmar inscrição,
//         exibir contador de inscritos (admin), fechar inscrições (admin)
// ─────────────────────────────────────────────────────────────

import { auth, db } from "./firebase-config.js";
import { initPlayoffs, calcularClassificacaoLista } from "./liga/playoffs.js";

import {
    onAuthStateChanged,
    sendEmailVerification
} from "https://www.gstatic.com/firebasejs/12.12.1/firebase-auth.js";

import {
    doc,
    getDoc,
    setDoc,
    updateDoc,
    deleteDoc,
    collection,
    addDoc,
    getDocs,
    writeBatch,
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
            return s === "inscricoes" || s === "nomes_times" || s === "ativo" || s === "playoffs" || s === "encerrado";
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
        inscricoes:  "🟢 Inscrições abertas",
        draft:       "🟡 Montando times",
        nomes_times: "🏷️ Definindo nomes",
        ativo:       "🔴 Em andamento",
        playoffs:    "⚡ Playoffs",
        encerrado:   "⚫ Encerrado"
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
            <button class="btn-excluir-liga" data-liga-id="${id}" data-liga-nome="${nomeEscapado}" title="Excluir liga">🗑️</button>

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

            ${liga.status === "nomes_times" ? `
            <button class="btn-gerar-rodadas" data-liga-id="${id}" data-liga-nome="${nomeEscapado}">
                🎯 Gerar Rodadas
            </button>
            <button class="btn-ver-calendario" data-liga-id="${id}" data-liga-nome="${nomeEscapado}" data-aba="times">
                📖 Ver Times
            </button>
            ` : ""}

            ${liga.status === "ativo" ? `
            <button class="btn-ver-calendario" data-liga-id="${id}" data-liga-nome="${nomeEscapado}">
                📅 Calendário e Placar
            </button>
            <button class="btn-iniciar-playoffs" data-liga-id="${id}" data-liga-nome="${nomeEscapado}">
                ⚡ Iniciar Playoffs
            </button>
            ` : ""}

            ${liga.status === "playoffs" ? `
            <button class="btn-ver-calendario" data-liga-id="${id}" data-liga-nome="${nomeEscapado}">
                📅 Fase de Grupos
            </button>
            <button class="btn-ver-playoffs" data-liga-id="${id}" data-liga-nome="${nomeEscapado}">
                ⚡ Ver Playoffs
            </button>
            ` : ""}
        </div>
        ` : `
        ${liga.status === "inscricoes" ? `
        <button class="btn-inscricao" data-liga-id="${id}" data-liga-nome="${nomeEscapado}">
            Ver Liga
        </button>
        ` : ""}
        ${liga.status === "nomes_times" ? `
        <button class="btn-ver-calendario" data-liga-id="${id}" data-liga-nome="${nomeEscapado}" data-liga-status="nomes_times">
            👀 Ver Times
        </button>
        ` : ""}
        ${liga.status === "ativo" ? `
        <button class="btn-ver-calendario" data-liga-id="${id}" data-liga-nome="${nomeEscapado}" data-liga-status="ativo">
            📅 Ver Calendário
        </button>
        ` : ""}
        ${liga.status === "playoffs" ? `
        <button class="btn-ver-calendario" data-liga-id="${id}" data-liga-nome="${nomeEscapado}" data-liga-status="playoffs">
            ⚡ Ver Liga
        </button>
        ` : ""}
        ${liga.status === "encerrado" ? `
        <button class="btn-ver-calendario" data-liga-id="${id}" data-liga-nome="${nomeEscapado}" data-liga-status="encerrado">
            🏆 Ver Resultados
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
        // Jogador vai para a view dedicada (não o modal do admin)
        // data-liga-status indica se está em "ativo" ou "playoffs"
        abrirViewJogador(btnCal.dataset.ligaId, btnCal.dataset.ligaNome, btnCal.dataset.ligaStatus || "ativo");
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

    // Admin: clicou em "🗑️ Excluir"
    const btnExcluir = evento.target.closest(".btn-excluir-liga");
    if (btnExcluir) {
        await excluirLiga(btnExcluir.dataset.ligaId, btnExcluir.dataset.ligaNome);
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

    // Admin: clicou em "🎯 Gerar Rodadas"
    const btnGerarRodadas = evento.target.closest(".btn-gerar-rodadas");
    if (btnGerarRodadas) {
        await confirmarEGerarRodadas(btnGerarRodadas.dataset.ligaId, btnGerarRodadas.dataset.ligaNome);
        return;
    }

    // Admin: clicou em "Calendário e Placar" ou "📖 Ver Times"
    const btnCal = evento.target.closest(".btn-ver-calendario");
    if (btnCal) {
        await abrirCalendario(btnCal.dataset.ligaId, btnCal.dataset.ligaNome, btnCal.dataset.aba || "jogos");
        return;
    }

    // Admin: clicou em "⚡ Iniciar Playoffs"
    const btnIniciarPo = evento.target.closest(".btn-iniciar-playoffs");
    if (btnIniciarPo) {
        abrirModalIniciarPlayoffs(btnIniciarPo.dataset.ligaId, btnIniciarPo.dataset.ligaNome);
        return;
    }

    // Admin: clicou em "⚡ Ver Playoffs"
    const btnVerPo = evento.target.closest(".btn-ver-playoffs");
    if (btnVerPo) {
        await abrirModalPlayoffs(btnVerPo.dataset.ligaId, btnVerPo.dataset.ligaNome);
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

        // Avança status da liga para "nomes_times"
        // (jogadores ainda vão definir o nome do time antes de gerar as rodadas)
        batch.update(doc(db, "ligas", draftState.ligaId), { status: "nomes_times" });

        await batch.commit();

        mostrarFeedback("Times formados! Agora os jogadores podem definir o nome do time. 🏷️", "sucesso");
        fecharDraft();
        await carregarLigasAdmin();

    } catch (erro) {
        console.error("Erro ao salvar draft:", erro);
        mostrarFeedback("Erro ao salvar times. Tente novamente.", "erro");
        btnSalvarDraft.disabled = false;
        btnSalvarDraft.textContent = "Salvar Times e Aguardar Nomes 🏷️";
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
// numTurnos: 1 = round-robin simples, 2 = turno+returno, etc.
async function gerarCalendario(ligaId, times, numTurnos = 1) {
    try {
        const { writeBatch: wb } = await import("https://www.gstatic.com/firebasejs/12.12.1/firebase-firestore.js");
        const batch = wb(db);

        // Algoritmo de rotação: fixa o primeiro, roda os demais
        const listaBase = [...times];

        // Se número ímpar de times, adiciona um "bye" (folga)
        if (listaBase.length % 2 !== 0) {
            listaBase.push({ id: "bye", nome: "Folga", cor: "#555" });
        }

        const n = listaBase.length;
        const rodadasPorTurno = n - 1;

        for (let turno = 0; turno < numTurnos; turno++) {
            // Reinicia a lista na ordem original a cada turno
            const lista = [...listaBase];

            for (let r = 0; r < rodadasPorTurno; r++) {
                for (let i = 0; i < n / 2; i++) {
                    const timeA = lista[i];
                    const timeB = lista[n - 1 - i];

                    // Pula jogos contra "bye"
                    if (timeA.id === "bye" || timeB.id === "bye") continue;

                    const rodadaNum = turno * rodadasPorTurno + r + 1;
                    const jogoRef = doc(collection(db, "ligas", ligaId, "jogos"));
                    batch.set(jogoRef, {
                        rodada:  rodadaNum,
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
        }

        const totalRodadas = rodadasPorTurno * numTurnos;
        await batch.commit();
        console.log(`Calendário gerado: ${totalRodadas} rodadas (${numTurnos} turno(s)) para ${times.length} times.`);

    } catch (erro) {
        console.error("Erro ao gerar calendário:", erro);
        mostrarFeedback("Times salvos, mas erro ao gerar calendário.", "info");
    }
}

// ─────────────────────────────────────────────────────────────
// confirmarEGerarRodadas(ligaId, ligaNome)
// Admin clicou "Gerar Rodadas": busca os times já salvos no
// Firestore, pergunta quantos turnos e gera o calendário.
// Muda status de "nomes_times" para "ativo".
// ─────────────────────────────────────────────────────────────
async function confirmarEGerarRodadas(ligaId, ligaNome) {
    // Carrega os times salvos
    let times;
    try {
        const snap = await getDocs(collection(db, "ligas", ligaId, "times"));
        if (snap.empty) {
            mostrarFeedback("Nenhum time encontrado. Algo deu errado.", "erro");
            return;
        }
        times = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (e) {
        mostrarFeedback("Erro ao carregar times.", "erro");
        return;
    }

    // Mostra nomes atuais para o admin confirmar
    const listaNomes = times.map(t => `• ${t.nome}`).join("\n");
    const nTimes = times.length;
    const rodadasBase = nTimes % 2 === 0 ? nTimes - 1 : nTimes;

    const respTurnos = prompt(
        `Liga: ${ligaNome}\n\n` +
        `Times (${nTimes}):\n${listaNomes}\n\n` +
        `Quantos turnos no calendário?\n` +
        `• 1 turno  = ${rodadasBase} rodadas\n` +
        `• 2 turnos = ${rodadasBase * 2} rodadas (turno + returno)\n\n` +
        `Digite 1, 2, 3...`,
        "1"
    );
    if (respTurnos === null) return; // cancelou

    const numTurnos = Math.max(1, Math.min(10, parseInt(respTurnos) || 1));

    try {
        mostrarFeedback("Gerando calendário...", "info");

        await gerarCalendario(ligaId, times, numTurnos);

        // Avança status para "ativo"
        await updateDoc(doc(db, "ligas", ligaId), { status: "ativo" });

        mostrarFeedback(`Calendário gerado! ${numTurnos * rodadasBase} rodadas criadas. 🏆`, "sucesso");
        await carregarLigasAdmin();

    } catch (e) {
        console.error("Erro ao gerar rodadas:", e);
        mostrarFeedback("Erro ao gerar rodadas.", "erro");
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
async function abrirCalendario(ligaId, ligaNome, abaInicial = "jogos") {
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

    // Define qual aba fica ativa ao abrir (padrão: jogos)
    calTabs.forEach(t => t.classList.toggle("ativo", t.dataset.tab === abaInicial));
    calJogosEl.classList.toggle("oculto",   abaInicial !== "jogos");
    calClassEl.classList.toggle("oculto",   abaInicial !== "classificacao");
    calTimesEl.classList.toggle("oculto",   abaInicial !== "times");

    modalCalendario.classList.remove("oculto");
    document.body.style.overflow = "hidden";

    // Se a aba inicial for "times", carrega times direto (sem jogos)
    if (abaInicial === "times") {
        calJogosEl.innerHTML = '<p class="draft-carregando">Aguardando geração do calendário.</p>';
        await carregarTimesParaEditar();
        return;
    }

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

    // ── Chips de filtro por rodada ──────────────────────────────
    const rodadasUnicas = [...new Set(calState.jogos.map(j => +j.rodada))]
        .filter(r => !isNaN(r))
        .sort((a, b) => a - b);

    if (rodadasUnicas.length > 1) {
        const filtroDiv = document.createElement("div");
        filtroDiv.className = "cal-rodada-filtro";
        filtroDiv.innerHTML =
            `<button class="cal-rod-chip ativo" data-rod="todas">Todas</button>` +
            rodadasUnicas.map(r => `<button class="cal-rod-chip" data-rod="${r}">Rod. ${r}</button>`).join("");
        calJogosEl.appendChild(filtroDiv);

        filtroDiv.addEventListener("click", (e) => {
            const chip = e.target.closest(".cal-rod-chip");
            if (!chip) return;
            filtroDiv.querySelectorAll(".cal-rod-chip").forEach(c => c.classList.remove("ativo"));
            chip.classList.add("ativo");
            const rodFiltro = chip.dataset.rod;
            calJogosEl.querySelectorAll(".cal-rodada").forEach(secao => {
                if (rodFiltro === "todas") {
                    secao.style.display = "";
                } else {
                    const titulo = secao.querySelector(".cal-rodada-titulo");
                    secao.style.display =
                        titulo && titulo.textContent.trim() === `Rodada ${rodFiltro}` ? "" : "none";
                }
            });
        });
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
                       <button class="btn-excluir-jogo" data-jogo-id="${jogo.id}" title="Excluir confronto">🗑️</button>
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

    // Listener: excluir confronto
    calJogosEl.querySelectorAll(".btn-excluir-jogo").forEach(btn => {
        btn.addEventListener("click", () => {
            excluirJogo(btn.dataset.jogoId);
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
            a.v++; a.pts += 3;
            b.d++;            // derrota = 0 pontos
        } else if (jogo.placarB > jogo.placarA) {
            b.v++; b.pts += 3;
            a.d++;            // derrota = 0 pontos
        } else {
            // Empate (raro em basquete, mas previsto)
            a.v++; a.pts += 1;
            b.v++; b.pts += 1;
        }
    });

    // Ordena: pts desc → saldo de pontos desc → cestas feitas desc
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
                    <th title="Saldo de Pontos">SP</th>
                    <th title="Pontos" class="pts">Pts</th>
                </tr>
            </thead>
            <tbody>${linhas}</tbody>
        </table>
        <p class="class-legenda">V=3pts · D=0pts · Critério: Pts → Saldo de pontos</p>
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
    novoJogoData.value   = "";
    novoJogoHora.value   = "";
    novoJogoLocal.value  = "";
    novoJogoObs.value    = "";

    // Popula select de rodada com rodadas existentes + nova rodada
    const rodadasExistentes = [...new Set(calState.jogos.map(j => +j.rodada))]
        .filter(r => !isNaN(r))
        .sort((a, b) => a - b);
    const maxRodada  = rodadasExistentes.length > 0 ? Math.max(...rodadasExistentes) : 0;
    const novaRodada = maxRodada + 1;

    const opRodadas = rodadasExistentes
        .map(r => `<option value="${r}">Rodada ${r}</option>`)
        .join("");

    novoJogoRodada.innerHTML =
        `<option value="">Selecione a rodada...</option>` +
        opRodadas +
        `<option value="${novaRodada}">🆕 Nova — Rodada ${novaRodada}</option>`;

    // Pré-seleciona a nova rodada por padrão
    novoJogoRodada.value = novaRodada;

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
// VIEW CALENDÁRIO DO JOGADOR — design moderno, tela cheia
// Substitui o painel do jogador ao clicar "📅 Ver Calendário"
// Admin continua usando o modal antigo (mais funcional)
// ════════════════════════════════════════════════════════════════

// Estado da view do jogador (separado do calState do admin)
let vjcState = {
    ligaId:     null,
    ligaNome:   "",
    ligaStatus: "ativo",
    jogos:      []
};

// Referências de DOM da view do jogador
const vjcWrapper      = document.getElementById("view-jogador-calendario");
const vjcLigaNome     = document.getElementById("vjc-liga-nome");
const vjcBtnVoltar    = document.getElementById("vjc-btn-voltar");
const vjcJogosEl      = document.getElementById("vjc-jogos");
const vjcTimesEl      = document.getElementById("vjc-times");
const vjcClassEl      = document.getElementById("vjc-classificacao");
const vjcPlayoffsEl   = document.getElementById("vjc-playoffs");
const vjcTabs         = document.querySelectorAll(".vjc-tab");
const vjcTabPlayoffs  = document.querySelector(".vjc-tab-playoffs");

// Botão Voltar: esconde a view e mostra o painel do jogador
vjcBtnVoltar.addEventListener("click", () => {
    vjcWrapper.classList.add("oculto");
    painelJogador.classList.remove("oculto");
});

// Troca de abas da view
vjcTabs.forEach(tab => {
    tab.addEventListener("click", () => {
        vjcTabs.forEach(t => t.classList.remove("ativo"));
        tab.classList.add("ativo");

        vjcJogosEl.classList.add("oculto");
        vjcTimesEl.classList.add("oculto");
        vjcClassEl.classList.add("oculto");
        vjcPlayoffsEl.classList.add("oculto");

        if (tab.dataset.vjcTab === "jogos") {
            vjcJogosEl.classList.remove("oculto");
        } else if (tab.dataset.vjcTab === "times") {
            vjcTimesEl.classList.remove("oculto");
            renderizarTimesJogador();
        } else if (tab.dataset.vjcTab === "classificacao") {
            vjcClassEl.classList.remove("oculto");
            renderizarClassificacaoJogador();
        } else if (tab.dataset.vjcTab === "playoffs") {
            vjcPlayoffsEl.classList.remove("oculto");
            renderizarPlayoffsJogador();
        }
    });
});

// ─────────────────────────────────────────────────────────────
// abrirViewJogador(ligaId, ligaNome, ligaStatus)
// Esconde o painel e abre a view dedicada do jogador
// ligaStatus: "ativo" | "playoffs" — controla aba visível
// ─────────────────────────────────────────────────────────────
async function abrirViewJogador(ligaId, ligaNome, ligaStatus = "ativo") {
    vjcState.ligaId     = ligaId;
    vjcState.ligaNome   = ligaNome;
    vjcState.ligaStatus = ligaStatus;
    vjcState.jogos      = [];

    // Atualiza nome da liga no topo
    vjcLigaNome.textContent = ligaNome;

    // Mostra aba Playoffs quando a liga está em playoffs ou encerrada
    if (ligaStatus === "playoffs" || ligaStatus === "encerrado") {
        vjcTabPlayoffs.classList.remove("oculto");
    } else {
        vjcTabPlayoffs.classList.add("oculto");
    }

    // Limpa conteúdo anterior
    vjcJogosEl.innerHTML    = '<p class="vjc-carregando">Carregando jogos...</p>';
    vjcTimesEl.innerHTML    = '<p class="vjc-carregando">Carregando times...</p>';
    vjcClassEl.innerHTML    = '<p class="vjc-carregando">Calculando...</p>';
    vjcPlayoffsEl.innerHTML = '<p class="vjc-carregando">Carregando playoffs...</p>';

    // Na fase de nomes, a aba padrão é Times (para o jogador nomear seu time)
    const abaInicial = ligaStatus === "nomes_times" ? "times" : "jogos";

    // Garante aba correta ativa
    vjcTabs.forEach(t => t.classList.toggle("ativo", t.dataset.vjcTab === abaInicial));
    vjcJogosEl.classList.toggle("oculto",   abaInicial !== "jogos");
    vjcTimesEl.classList.toggle("oculto",   abaInicial !== "times");
    vjcClassEl.classList.add("oculto");
    vjcPlayoffsEl.classList.add("oculto");

    // Transição: esconde painel, mostra a view
    painelJogador.classList.add("oculto");
    vjcWrapper.classList.remove("oculto");
    window.scrollTo({ top: 0, behavior: "smooth" });

    // Fase de nomes: sem jogos ainda, admin ainda está definindo os nomes dos times
    if (ligaStatus === "nomes_times") {
        vjcJogosEl.innerHTML = '<p class="vjc-vazio">⏳ O admin ainda está definindo os nomes dos times. O calendário será gerado em breve!</p>';
        renderizarTimesJogador();
        return;
    }

    try {
        const q    = query(collection(db, "ligas", ligaId, "jogos"), orderBy("rodada"));
        const snap = await getDocs(q);
        vjcState.jogos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderizarJogosJogador();
    } catch (erro) {
        console.error("Erro ao carregar jogos:", erro);
        vjcJogosEl.innerHTML = '<p class="vjc-carregando">Erro ao carregar jogos.</p>';
    }
}

// ─────────────────────────────────────────────────────────────
// renderizarJogosJogador()
// Renderiza os cards de jogos com design moderno para o jogador
// ─────────────────────────────────────────────────────────────
function renderizarJogosJogador() {
    vjcJogosEl.innerHTML = "";

    if (vjcState.jogos.length === 0) {
        vjcJogosEl.innerHTML = '<p class="vjc-vazio">Nenhum jogo cadastrado ainda.</p>';
        return;
    }

    // Agrupa jogos por rodada
    const porRodada = {};
    vjcState.jogos.forEach(jogo => {
        if (!porRodada[jogo.rodada]) porRodada[jogo.rodada] = [];
        porRodada[jogo.rodada].push(jogo);
    });

    // Labels e cores de cada status
    const statusInfo = {
        finalizado: { label: "✅ Finalizado",  cls: "status-finalizado" },
        pendente:   { label: "⏳ Em breve",     cls: "status-pendente"   },
        cancelado:  { label: "❌ Cancelado",    cls: "status-cancelado"  },
        adiado:     { label: "📅 Adiado",       cls: "status-adiado"     }
    };

    Object.keys(porRodada).sort((a, b) => Number(a) - Number(b)).forEach(rodada => {
        const secao = document.createElement("div");
        secao.className = "vjc-rodada";

        const jogosHTML = porRodada[rodada].map(jogo => {
            const finalizado = jogo.status === "finalizado";
            const cancelado  = jogo.status === "cancelado";

            // Placar: número grande se finalizado, senão "—"
            const placarA = finalizado ? jogo.placarA : "—";
            const placarB = finalizado ? jogo.placarB : "—";

            // Destaque para o vencedor
            const vencedorA = finalizado && jogo.placarA > jogo.placarB;
            const vencedorB = finalizado && jogo.placarB > jogo.placarA;

            // Formata data se existir
            let dataFormatada = "";
            if (jogo.data) {
                const [ano, mes, dia] = jogo.data.split("-");
                const nomesMes = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
                dataFormatada = `${dia} ${nomesMes[parseInt(mes, 10) - 1]}`;
            }

            // Linha de meta info (data, hora, local)
            const metaItens = [];
            if (dataFormatada || jogo.hora) metaItens.push(`📅 ${[dataFormatada, jogo.hora].filter(Boolean).join(" · ")}`);
            if (jogo.local)                 metaItens.push(`📍 ${jogo.local}`);
            const meta = metaItens.length ? `<div class="vjc-card-meta">${metaItens.join("<span class='vjc-sep'>|</span>")}</div>` : "";

            // Observação
            const obs = jogo.obs ? `<div class="vjc-card-obs">💬 ${jogo.obs}</div>` : "";

            // Badge de status
            const si = statusInfo[jogo.status] || { label: jogo.status, cls: "" };

            return `
                <div class="vjc-card ${cancelado ? "vjc-card-cancelado" : ""}">
                    <span class="vjc-card-status ${si.cls}">${si.label}</span>

                    <div class="vjc-card-confronto">
                        <!-- Time A -->
                        <div class="vjc-time ${vencedorA ? "vjc-vencedor" : ""}">
                            <span class="vjc-time-barra" style="background: ${jogo.timeA.cor}"></span>
                            <span class="vjc-time-nome">${jogo.timeA.nome}</span>
                        </div>

                        <!-- Placar central -->
                        <div class="vjc-placar">
                            <span class="vjc-placar-num ${vencedorA ? "vjc-vencedor-num" : ""}">${placarA}</span>
                            <span class="vjc-placar-sep">×</span>
                            <span class="vjc-placar-num ${vencedorB ? "vjc-vencedor-num" : ""}">${placarB}</span>
                        </div>

                        <!-- Time B -->
                        <div class="vjc-time vjc-time-direita ${vencedorB ? "vjc-vencedor" : ""}">
                            <span class="vjc-time-nome">${jogo.timeB.nome}</span>
                            <span class="vjc-time-barra" style="background: ${jogo.timeB.cor}"></span>
                        </div>
                    </div>

                    ${meta}
                    ${obs}
                </div>
            `;
        }).join("");

        secao.innerHTML = `
            <div class="vjc-rodada-label">Rodada ${rodada}</div>
            <div class="vjc-rodada-jogos">${jogosHTML}</div>
        `;

        vjcJogosEl.appendChild(secao);
    });
}

// ─────────────────────────────────────────────────────────────
// renderizarTimesJogador()
// Lista todos os times da liga em ordem alfabética, mostrando
// os jogadores de cada time e a posição na classificação atual
// ─────────────────────────────────────────────────────────────
async function renderizarTimesJogador() {
    vjcTimesEl.innerHTML = '<p class="vjc-carregando">Carregando times...</p>';

    try {
        // Carrega times e jogadores em paralelo
        const [timesSnap, jogadoresSnap] = await Promise.all([
            getDocs(collection(db, "ligas", vjcState.ligaId, "times")),
            getDocs(collection(db, "ligas", vjcState.ligaId, "inscricoes"))
        ]);

        const times = timesSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        if (times.length === 0) {
            vjcTimesEl.innerHTML = '<p class="vjc-vazio">Nenhum time formado ainda.</p>';
            return;
        }

        // Mapeia uid → dados do inscrito (nome, posição)
        const jogadoresMap = {};
        jogadoresSnap.docs.forEach(d => {
            jogadoresMap[d.id] = d.data();
        });

        // Descobre qual é o time do usuário logado
        const meuUid = usuarioAtual?.uid || null;
        const meuTimeId = meuUid && jogadoresMap[meuUid] ? jogadoresMap[meuUid].timeId : null;

        // Calcula classificação com os jogos já carregados em vjcState.jogos
        const classificacao = calcularClassificacaoLista(vjcState.jogos);
        const posMap = {};
        classificacao.forEach((t, i) => { posMap[t.id] = i + 1; });

        // Ordena times alfabeticamente
        const timesOrdenados = [...times].sort((a, b) =>
            a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" })
        );

        const total = classificacao.length;

        const cardsHTML = timesOrdenados.map(time => {
            const pos = posMap[time.id];
            let posLabel = "";
            let posClasse = "";

            if (pos === 1) {
                posLabel  = "🥇 1º lugar";
                posClasse = "vjc-time-pos-ouro";
            } else if (pos === 2) {
                posLabel  = "🥈 2º lugar";
                posClasse = "vjc-time-pos-prata";
            } else if (pos === 3) {
                posLabel  = "🥉 3º lugar";
                posClasse = "vjc-time-pos-bronze";
            } else if (pos) {
                // Últimos 3 = zona vermelha
                const zonaRebaixamento = total > 3 && pos > total - 3;
                posLabel  = `${pos}º lugar`;
                posClasse = zonaRebaixamento ? "vjc-time-pos-zona" : "vjc-time-pos-normal";
            }

            // Lista de jogadores (de jogadores[] no documento do time)
            const jogadores = (time.jogadores || []);
            const jogadoresHTML = jogadores.length > 0
                ? jogadores.map(j => {
                    const dados = jogadoresMap[j.uid] || {};
                    const posicao = dados.posicao || j.posicao || "";
                    // Mapeia posição para classe de cor
                    const posClasses = {
                        "armador":     "vjc-pos-pg",
                        "ala-armador": "vjc-pos-sg",
                        "ala-pivô":    "vjc-pos-pf",
                        "ala-pivo":    "vjc-pos-pf",
                        "pivô":        "vjc-pos-c",
                        "pivo":        "vjc-pos-c",
                        "ala":         "vjc-pos-sf"
                    };
                    const posKey = Object.keys(posClasses).find(k => posicao.toLowerCase().includes(k)) || "";
                    const posCorClasse = posClasses[posKey] || "";
                    return `
                        <div class="vjc-time-jogador">
                            <span class="vjc-time-jogador-nome">${j.nomeJogador || dados.nomeJogador || "Jogador"}</span>
                            ${posicao ? `<span class="vjc-time-jogador-pos ${posCorClasse}">${posicao}</span>` : ""}
                        </div>
                    `;
                }).join("")
                : '<span class="vjc-time-sem-jogadores">Nenhum jogador</span>';

            return `
                <div class="vjc-time-card ${meuTimeId === time.id ? "vjc-meu-time" : ""}" style="border-top: 3px solid ${time.cor || '#555'}">
                    <div class="vjc-time-card-header">
                        <div class="vjc-time-card-info">
                            <span class="vjc-time-card-nome" style="color:${time.cor || '#fff'}">${time.nome}</span>
                            ${posLabel ? `<span class="vjc-time-pos-badge ${posClasse}">${posLabel}</span>` : ""}
                        </div>
                    </div>
                    <div class="vjc-time-card-jogadores">
                        ${jogadoresHTML}
                    </div>
                </div>
            `;
        }).join("");

        vjcTimesEl.innerHTML = `<div class="vjc-times-lista">${cardsHTML}</div>`;

    } catch (erro) {
        console.error("Erro ao carregar times:", erro);
        vjcTimesEl.innerHTML = '<p class="vjc-vazio">Erro ao carregar times.</p>';
    }
}

// ─────────────────────────────────────────────────────────────
// renderizarClassificacaoJogador()
// Tabela de classificação estilizada para a view do jogador
// Mesma lógica do admin (V=2pts, D=1pt), visual diferente
// ─────────────────────────────────────────────────────────────
function renderizarClassificacaoJogador() {
    // Coleta times únicos
    const times = {};
    vjcState.jogos.forEach(jogo => {
        [jogo.timeA, jogo.timeB].forEach(t => {
            if (!times[t.id]) {
                times[t.id] = { nome: t.nome, cor: t.cor, j: 0, v: 0, d: 0, pts: 0, cestas: 0, cestasSofridas: 0 };
            }
        });
    });

    // Calcula resultados
    vjcState.jogos.filter(j => j.status === "finalizado").forEach(jogo => {
        const a = times[jogo.timeA.id];
        const b = times[jogo.timeB.id];
        if (!a || !b) return;

        a.j++; b.j++;
        a.cestas += jogo.placarA;    a.cestasSofridas += jogo.placarB;
        b.cestas += jogo.placarB;    b.cestasSofridas += jogo.placarA;

        if (jogo.placarA > jogo.placarB) {
            a.v++; a.pts += 3; b.d++;  // derrota = 0 pontos
        } else if (jogo.placarB > jogo.placarA) {
            b.v++; b.pts += 3; a.d++;  // derrota = 0 pontos
        } else {
            a.v++; a.pts += 1; b.v++; b.pts += 1;
        }
    });

    // Ordena: pts → saldo de pontos → cestas feitas
    const ordenado = Object.values(times).sort((x, y) => {
        if (y.pts !== x.pts) return y.pts - x.pts;
        const sx = x.cestas - x.cestasSofridas;
        const sy = y.cestas - y.cestasSofridas;
        if (sy !== sx) return sy - sx;
        return y.cestas - x.cestas;
    });

    if (ordenado.length === 0) {
        vjcClassEl.innerHTML = '<p class="vjc-vazio">Nenhum resultado ainda.</p>';
        return;
    }

    const total = ordenado.length;

    // Medalhas para os 3 primeiros
    const medalhas = ["🥇", "🥈", "🥉"];
    // Classes de destaque
    const classesPosicao = [
        "vjc-class-ouro",
        "vjc-class-prata",
        "vjc-class-bronze"
    ];

    // Cards de classificação (um por time)
    const cardsHTML = ordenado.map((t, i) => {
        const posLabel  = i < 3 ? medalhas[i] : `${i + 1}º`;
        const classePos = i < 3 ? classesPosicao[i] : (i >= total - 3 && total > 3 ? "vjc-class-zona-rebaixamento" : "");
        const saldo    = t.cestas - t.cestasSofridas;
        const saldoStr = saldo >= 0 ? `+${saldo}` : `${saldo}`;

        return `
            <div class="vjc-class-card ${classePos}">
                <div class="vjc-class-pos">${posLabel}</div>
                <span class="vjc-class-cor" style="background: ${t.cor}"></span>
                <div class="vjc-class-info">
                    <span class="vjc-class-nome">${t.nome}</span>
                    <div class="vjc-class-stats">
                        <span title="Jogos">J <strong>${t.j}</strong></span>
                        <span title="Vitórias" class="vjc-stat-v">V <strong>${t.v}</strong></span>
                        <span title="Derrotas" class="vjc-stat-d">D <strong>${t.d}</strong></span>
                        <span title="Saldo de pontos">SP <strong>${saldoStr}</strong></span>
                    </div>
                </div>
                <div class="vjc-class-pts">${t.pts}<small>pts</small></div>
            </div>
        `;
    }).join("");

    vjcClassEl.innerHTML = `
        <div class="vjc-class-lista">${cardsHTML}</div>
        <p class="vjc-class-legenda">V = 3pts · D = 0pts · Critério de desempate: Saldo de pontos</p>
    `;
}
// ================================================================
// PLAYOFFS - inicializado em scripts/liga/playoffs.js
// ================================================================

// Estas variaveis sao preenchidas por initPlayoffs() logo abaixo.
// Precisam estar no escopo do modulo para que os event listeners acima as usem.
let abrirModalIniciarPlayoffs, abrirModalPlayoffs, renderizarPlayoffsJogador;

({  abrirModalIniciarPlayoffs,
    abrirModalPlayoffs,
    renderizarPlayoffsJogador
} = initPlayoffs({
    db, collection, doc, getDocs, updateDoc, writeBatch,
    serverTimestamp, query, orderBy,
    mostrarFeedback,
    carregarLigasAdmin,
    getVjcState:      () => vjcState,
    getVjcPlayoffsEl: () => document.getElementById('vjc-playoffs')
}));

// ════════════════════════════════════════════════════════════════
// EXCLUSÃO — Jogo e Liga
// ════════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────
// excluirJogo(jogoId)
// Remove um confronto do Firestore e atualiza a lista local
// ─────────────────────────────────────────────────────────────
async function excluirJogo(jogoId) {
    // Pede confirmação antes de excluir (ação irreversível)
    const confirmado = window.confirm("Tem certeza que quer excluir este confronto? Essa ação não pode ser desfeita.");
    if (!confirmado) return;

    try {
        // Deleta o documento do jogo no Firestore
        await deleteDoc(doc(db, "ligas", calState.ligaId, "jogos", jogoId));

        // Remove o jogo da lista local para atualizar a tela sem recarregar
        calState.jogos = calState.jogos.filter(j => j.id !== jogoId);
        renderizarJogos();
        mostrarFeedback("Confronto excluído.", "sucesso");
    } catch (erro) {
        console.error("Erro ao excluir jogo:", erro);
        mostrarFeedback("Erro ao excluir confronto.", "erro");
    }
}

// ─────────────────────────────────────────────────────────────
// excluirLiga(ligaId, ligaNome)
// Exclui a liga e todas as suas subcoleções (inscricoes, times, jogos)
// Note: no Firestore, excluir um documento NÃO exclui subcoleções
// automaticamente — temos que deletar cada uma manualmente
// ─────────────────────────────────────────────────────────────
async function excluirLiga(ligaId, ligaNome) {
    // Confirmação dupla: primeira com o nome da liga
    const confirmado = window.confirm(`Excluir a liga "${ligaNome}"? Todos os times, jogos e inscrições serão apagados permanentemente.`);
    if (!confirmado) return;

    mostrarFeedback("Excluindo liga...", "info");

    try {
        // Exclui cada subcoleção manualmente (obrigatório no Firestore via SDK)
        const subcolecoes = ["inscricoes", "times", "jogos"];

        for (const subNome of subcolecoes) {
            // Busca todos os documentos da subcoleção
            const subRef = collection(db, "ligas", ligaId, subNome);
            const snap = await getDocs(subRef);
            // Deleta cada um
            for (const docSnap of snap.docs) {
                await deleteDoc(docSnap.ref);
            }
        }

        // Depois de limpar as subcoleções, exclui o documento principal
        await deleteDoc(doc(db, "ligas", ligaId));

        mostrarFeedback(`Liga "${ligaNome}" excluída.`, "sucesso");

        // Recarrega a lista de ligas do admin
        await carregarLigasAdmin();
    } catch (erro) {
        console.error("Erro ao excluir liga:", erro);
        mostrarFeedback("Erro ao excluir liga.", "erro");
    }
}

// ════════════════════════════════════════════════════════════════
// UTILITÁRIOS
// ════════════════════════════════════════════════════════════════

async function lerRole(uid) {
    try {
        const snap = await getDoc(doc(db, "users", uid));
        if (snap.exists() && snap.data().role) return snap.data().role;

        // Documento não existe: usuário novo que ainda não tem registro no Firestore.
        // Cria com role padrão "jogador" para que as regras de segurança
        // reconheçam o usuário e permitam leitura das ligas.
        await setDoc(doc(db, "users", uid), { role: "jogador" });
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
