
// 1. Variáveis de Estado


let tempoRestante = 600; // 10 minutos padrão
let cronometro = null;
let rodando = false;
let periodoAtual = 1;

// 2. Elementos do DOM
const displayTempo = document.getElementById('display-timer');
const displayHome = document.getElementById('score-home');
const displayGuest = document.getElementById('score-guest');
const displayPeriod = document.getElementById('display-period');
const btnStart = document.getElementById('start-pause');

// 3. Formatação de Tempo (MM:SS)
function formatar(segundos) {
    const min = Math.floor(segundos / 60);
    const seg = segundos % 60;
    return `${min.toString().padStart(2, '0')}:${seg.toString().padStart(2, '0')}`;
}

// 4. Lógica do Cronômetro (Iniciar/Pausar)
function toggleTimer() {
    if (rodando) {
        clearInterval(cronometro);
        btnStart.innerText = "INICIAR";
        rodando = false;
    } else {
        rodando = true;
        btnStart.innerText = "PAUSAR";
        cronometro = setInterval(() => {
            if (tempoRestante > 0) {
                tempoRestante--;
                displayTempo.innerText = formatar(tempoRestante);
            } else {
                clearInterval(cronometro);
                rodando = false;
                btnStart.innerText = "FIM";
                alert("Fim do Período!");
            }
        }, 1000);
    }
}

// 5. Ajuste Manual do Tempo (+/- 1 minuto)
function adjustTime(segundos) {
    tempoRestante += segundos;
    if (tempoRestante < 0) tempoRestante = 0;
    displayTempo.innerText = formatar(tempoRestante);
}

// 6. Adicionar Pontos (+1, +2, +3)
function addPoints(team, points) {
    const display = (team === 'home') ? displayHome : displayGuest;
    let atual = parseInt(display.innerText) || 0;
    let novoValor = atual + points;
    if (novoValor < 0) novoValor = 0; // Evita pontos negativos
    display.innerText = novoValor.toString().padStart(2, '0');
}

// 7. Controle de Faltas
function changeFouls(team, val) {
    const el = document.getElementById(`fouls-${team}`);
    let atual = parseInt(el.innerText) || 0;
    if (atual + val >= 0) {
        el.innerText = atual + val;
    }
}

// 8. Trocar Período (1º ao 4º)
function changePeriod() {
    periodoAtual++;
    if (periodoAtual > 4) {
        displayPeriod.innerText = "OT"; // Overtime/Prorrogação
    } else {
        displayPeriod.innerText = periodoAtual + "º";
    }
}

// 9. Eventos dos Botões de Controle
btnStart.onclick = toggleTimer;

document.getElementById('reset-timer').onclick = () => {
    if(confirm("Deseja resetar todo o placar?")) {
        location.reload();
    }
};