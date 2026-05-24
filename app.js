import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, deleteDoc, doc, query, orderBy } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ⬇️ COLE SUAS CREDENCIAIS AQUI
const firebaseConfig = {
  apiKey: "AIzaSyBeYblxeG-YbmFjNBMZKMbgwClYikZnxho",
  authDomain: "databasecdc-4b420.firebaseapp.com",
  projectId: "databasecdc-4b420",
  storageBucket: "databasecdc-4b420.firebasestorage.app",
  messagingSenderId: "563294958612",
  appId: "1:563294958612:web:d1a502e936bbe193702301"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const colecao = collection(db, 'participantes');

document.addEventListener('DOMContentLoaded', () => {

    let participantes = [];
    let isAdminUnlocked = false;
    let isDevMode = false;

    const KEY_ORGANIZER_PASS = 'corre_de_cria_organizer_password';
    const KEY_PERM_CLEAR = 'corre_de_cria_perm_clear';
    const KEY_PERM_EXPORT = 'corre_de_cria_perm_export';
    const DEV_MASTER_PASSWORD = '-Cepacol2026';

    let organizerPassword = localStorage.getItem(KEY_ORGANIZER_PASS) || 'Caradebode2026-';
    let permClearEnabled = localStorage.getItem(KEY_PERM_CLEAR) !== 'false';
    let permExportEnabled = localStorage.getItem(KEY_PERM_EXPORT) !== 'false';

    // SELETORES DOM (todos iguais ao seu app.js atual)
    const formPresenca = document.getElementById('form-presenca');
    const inputNome = document.getElementById('input-nome');
    const inputTelefone = document.getElementById('input-telefone');
    const inputIdade = document.getElementById('input-idade');
    const errorTelefone = document.getElementById('error-telefone');
    const publicTotalCount = document.getElementById('public-total-count');
    const searchInput = document.getElementById('search-input');
    const publicListGrid = document.getElementById('public-list-grid');
    const publicEmptyMessage = document.getElementById('public-empty-message');
    const btnToggleAdmin = document.getElementById('btn-toggle-admin');
    const adminPanel = document.getElementById('admin-panel');
    const btnCloseAdmin = document.getElementById('btn-close-admin');
    const adminAuthModal = document.getElementById('admin-auth-modal');
    const inputAdminPassword = document.getElementById('input-admin-password');
    const errorAdminPassword = document.getElementById('error-admin-password');
    const btnAuthCancel = document.getElementById('btn-auth-cancel');
    const btnAuthConfirm = document.getElementById('btn-auth-confirm');
    const btnCloseModal = document.getElementById('btn-close-modal');
    const adminStatTotal = document.getElementById('admin-stat-total');
    const adminStatAvgAge = document.getElementById('admin-stat-avg-age');
    const barSub18 = document.getElementById('bar-sub18');
    const barCriaAtivo = document.getElementById('bar-cria-ativo');
    const barCriaAdulto = document.getElementById('bar-cria-adulto');
    const barCriaMaster = document.getElementById('bar-cria-master');
    const countSub18 = document.getElementById('count-sub18');
    const countCriaAtivo = document.getElementById('count-cria-ativo');
    const countCriaAdulto = document.getElementById('count-cria-adulto');
    const countCriaMaster = document.getElementById('count-cria-master');
    const btnDownloadPdf = document.getElementById('btn-download-pdf');
    const btnClearAll = document.getElementById('btn-clear-all');
    const adminTableBody = document.getElementById('admin-table-body');
    const adminEmptyMessage = document.getElementById('admin-empty-message');
    const printDateToday = document.getElementById('print-date-today');
    const printTotalCount = document.getElementById('print-total-count');
    const printTableBody = document.getElementById('print-table-body');
    const printDateGenerated = document.getElementById('print-date-generated');
    const toastNotification = document.getElementById('toast-notification');
    const toastMessage = document.getElementById('toast-message');
    const devSettingsBox = document.getElementById('dev-settings-box');
    const devPermClear = document.getElementById('dev-perm-clear');
    const devPermExport = document.getElementById('dev-perm-export');
    const devOrganizerPassInput = document.getElementById('dev-organizer-pass-input');
    const btnSaveDevSettings = document.getElementById('btn-save-dev-settings');

    // ESCUTA EM TEMPO REAL O FIRESTORE
    // Qualquer mudança no banco atualiza a lista para TODOS automaticamente
    const q = query(colecao, orderBy('dataCadastro', 'asc'));
    onSnapshot(q, (snapshot) => {
        participantes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        atualizarInterface();
    });

    // MÁSCARAS & VALIDAÇÕES
    inputTelefone.addEventListener('input', (e) => {
        let value = e.target.value.replace(/\D/g, '');
        if (value.length > 11) value = value.substring(0, 11);
        if (value.length > 7) {
            value = value.replace(/^(\d{2})(\d{5})(\d{1,4})$/, '($1) $2-$3');
        } else if (value.length > 2) {
            value = value.replace(/^(\d{2})(\d{1,5})$/, '($1) $2');
        } else if (value.length > 0) {
            value = value.replace(/^(\d{1,2})$/, '($1');
        }
        e.target.value = value;
    });

    function validarTelefone(tel) {
        const digits = tel.replace(/\D/g, '');
        return digits.length === 10 || digits.length === 11;
    }

    function mascararTelefone(tel) {
        const d = tel.replace(/\D/g, '');
        if (d.length === 11) return `(${d.substring(0, 2)}) *****-${d.substring(7)}`;
        if (d.length === 10) return `(${d.substring(0, 2)}) ****-${d.substring(6)}`;
        return tel;
    }

    function validarNome(nome) {
        const partes = nome.trim().split(/\s+/);
        return partes.length >= 2 && partes.every(p => p.length >= 2);
    }

    function validarIdade(idade) {
        const n = parseInt(idade, 10);
        return !isNaN(n) && n >= 5 && n <= 100;
    }

    function classificarFaixaEtaria(idade) {
        const n = parseInt(idade, 10);
        if (n < 18) return 'Cria Sub-18 (Mirim)';
        if (n <= 29) return 'Cria 18-29 (Ativo)';
        if (n <= 45) return 'Cria 30-45 (Adulto)';
        return 'Cria 46+ (Master)';
    }

    function formatarCapitalize(str) {
        return str.toLowerCase().replace(/(^\w{1})|(\s+\w{1})/g, l => l.toUpperCase());
    }

    // SUBMISSÃO — salva no Firestore em vez do localStorage
    formPresenca.addEventListener('submit', async (e) => {
        e.preventDefault();

        const nomeVal = inputNome.value.trim();
        const telVal = inputTelefone.value.trim();
        const idadeVal = inputIdade.value.trim();
        let isValido = true;

        if (!validarNome(nomeVal)) {
            inputNome.parentElement.parentElement.classList.add('invalid');
            isValido = false;
        } else {
            inputNome.parentElement.parentElement.classList.remove('invalid');
        }

        if (!validarTelefone(telVal)) {
            errorTelefone.textContent = 'Insira um número válido no formato (00) 00000-0000.';
            inputTelefone.parentElement.parentElement.classList.add('invalid');
            isValido = false;
        } else {
            const telLimpo = telVal.replace(/\D/g, '');
            const telExistente = participantes.some(p => p.telefone.replace(/\D/g, '') === telLimpo);
            if (telExistente) {
                errorTelefone.textContent = 'Este número já confirmou presença para o corre!';
                inputTelefone.parentElement.parentElement.classList.add('invalid');
                isValido = false;
            } else {
                inputTelefone.parentElement.parentElement.classList.remove('invalid');
            }
        }

        if (!validarIdade(idadeVal)) {
            inputIdade.parentElement.parentElement.classList.add('invalid');
            isValido = false;
        } else {
            inputIdade.parentElement.parentElement.classList.remove('invalid');
        }

        if (isValido) {
            try {
                await addDoc(colecao, {
                    nome: formatarCapitalize(nomeVal),
                    telefone: telVal,
                    idade: parseInt(idadeVal, 10),
                    faixaEtaria: classificarFaixaEtaria(idadeVal),
                    dataCadastro: new Date().toISOString()
                });
                exibirToast('Presença confirmada no Corre! Corre de Cria ⚡');
                formPresenca.reset();
                document.querySelectorAll('.input-group').forEach(el => el.classList.remove('invalid'));
            } catch (err) {
                alert('Erro ao salvar presença: ' + err.message);
            }
        }
    });

    inputNome.addEventListener('input', () => inputNome.parentElement.parentElement.classList.remove('invalid'));
    inputTelefone.addEventListener('input', () => inputTelefone.parentElement.parentElement.classList.remove('invalid'));
    inputIdade.addEventListener('input', () => inputIdade.parentElement.parentElement.classList.remove('invalid'));

    // RENDERIZAÇÃO
    function atualizarInterface() {
        const busca = searchInput.value.toLowerCase().trim();
        const filtrados = participantes.filter(p => p.nome.toLowerCase().includes(busca));
        renderizarListaPublica(filtrados);
        publicTotalCount.textContent = participantes.length;
        if (isAdminUnlocked) renderizarPainelAdmin();
    }

    function renderizarListaPublica(lista) {
        publicListGrid.innerHTML = '';
        if (lista.length === 0) {
            publicEmptyMessage.classList.remove('hidden');
            return;
        }
        publicEmptyMessage.classList.add('hidden');
        lista.forEach(p => {
            const card = document.createElement('div');
            card.className = 'runner-card-pub';
            const badgeCompacto = p.faixaEtaria.split(' ')[1] || p.faixaEtaria;
            card.innerHTML = `
                <div class="runner-info-left">
                    <span class="runner-name">${p.nome}</span>
                </div>
                <span class="runner-badge-age">${badgeCompacto}</span>
            `;
            publicListGrid.appendChild(card);
        });
    }

    searchInput.addEventListener('input', () => atualizarInterface());

    // AUTENTICAÇÃO ADMIN (igual ao anterior)
    btnToggleAdmin.addEventListener('click', () => {
        if (isAdminUnlocked) fecharAreaAdmin();
        else abrirModalSenha();
    });
    btnCloseAdmin.addEventListener('click', () => fecharAreaAdmin());

    function abrirModalSenha() {
        adminAuthModal.classList.remove('hidden');
        inputAdminPassword.value = '';
        errorAdminPassword.classList.add('hidden');
        inputAdminPassword.focus();
    }

    function fecharModalSenha() {
        adminAuthModal.classList.add('hidden');
        inputAdminPassword.value = '';
        errorAdminPassword.classList.add('hidden');
    }

    btnAuthCancel.addEventListener('click', fecharModalSenha);
    btnCloseModal.addEventListener('click', fecharModalSenha);
    btnAuthConfirm.addEventListener('click', processarAutenticacao);
    inputAdminPassword.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') processarAutenticacao();
    });

    function processarAutenticacao() {
        const senha = inputAdminPassword.value;
        if (senha === DEV_MASTER_PASSWORD) {
            isAdminUnlocked = true; isDevMode = true;
            fecharModalSenha();
            btnToggleAdmin.innerHTML = `<svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 9.9-1"></path></svg><span>Dev Master 🛠️</span>`;
            btnToggleAdmin.classList.replace('btn-secondary-outline', 'btn-primary');
            adminPanel.classList.remove('hidden');
            devSettingsBox.classList.remove('hidden');
            devPermClear.checked = permClearEnabled;
            devPermExport.checked = permExportEnabled;
            devOrganizerPassInput.value = organizerPassword;
            adminPanel.scrollIntoView({ behavior: 'smooth' });
            renderizarPainelAdmin();
            exibirToast('Acesso de DESENVOLVEDOR MASTER liberado! 🛠️⚡');
        } else if (senha === organizerPassword) {
            isAdminUnlocked = true; isDevMode = false;
            fecharModalSenha();
            btnToggleAdmin.innerHTML = `<svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 9.9-1"></path></svg><span>Organizador 🔓</span>`;
            btnToggleAdmin.classList.replace('btn-secondary-outline', 'btn-primary');
            adminPanel.classList.remove('hidden');
            devSettingsBox.classList.add('hidden');
            adminPanel.scrollIntoView({ behavior: 'smooth' });
            renderizarPainelAdmin();
            exibirToast('Painel de Organizadores liberado! 🔒🔑');
        } else {
            errorAdminPassword.classList.remove('hidden');
            inputAdminPassword.parentElement.classList.add('invalid');
        }
    }

    inputAdminPassword.addEventListener('input', () => {
        errorAdminPassword.classList.add('hidden');
        inputAdminPassword.parentElement.classList.remove('invalid');
    });

    function fecharAreaAdmin() {
        isAdminUnlocked = false; isDevMode = false;
        btnToggleAdmin.innerHTML = `<svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg><span>Organizador 🔒</span>`;
        btnToggleAdmin.classList.replace('btn-primary', 'btn-secondary-outline');
        adminPanel.classList.add('hidden');
        devSettingsBox.classList.add('hidden');
    }

    // PAINEL ADMIN
    function renderizarPainelAdmin() {
        adminStatTotal.textContent = participantes.length;
        if (participantes.length === 0) {
            adminStatAvgAge.textContent = '0';
        } else {
            const soma = participantes.reduce((s, p) => s + p.idade, 0);
            adminStatAvgAge.textContent = (soma / participantes.length).toFixed(1);
        }

        let sub18 = 0, criaAtivo = 0, criaAdulto = 0, criaMaster = 0;
        participantes.forEach(p => {
            if (p.idade < 18) sub18++;
            else if (p.idade <= 29) criaAtivo++;
            else if (p.idade <= 45) criaAdulto++;
            else criaMaster++;
        });

        countSub18.textContent = sub18;
        countCriaAtivo.textContent = criaAtivo;
        countCriaAdulto.textContent = criaAdulto;
        countCriaMaster.textContent = criaMaster;

        const total = participantes.length || 1;
        barSub18.style.width = `${(sub18 / total) * 100}%`;
        barCriaAtivo.style.width = `${(criaAtivo / total) * 100}%`;
        barCriaAdulto.style.width = `${(criaAdulto / total) * 100}%`;
        barCriaMaster.style.width = `${(criaMaster / total) * 100}%`;

        if (isDevMode) {
            btnDownloadPdf.disabled = false;
            btnDownloadPdf.querySelector('span').textContent = 'BAIXAR RELATÓRIO PDF';
            btnClearAll.disabled = false;
            btnClearAll.querySelector('span').textContent = 'LIMPAR LISTA SEMANAL';
        } else {
            btnDownloadPdf.disabled = !permExportEnabled;
            btnDownloadPdf.querySelector('span').textContent = permExportEnabled ? 'BAIXAR RELATÓRIO PDF' : 'BAIXAR PDF (BLOQUEADO PELO DEV 🔒)';
            btnClearAll.disabled = !permClearEnabled;
            btnClearAll.querySelector('span').textContent = permClearEnabled ? 'LIMPAR LISTA SEMANAL' : 'LIMPAR LISTA (BLOQUEADO PELO DEV 🔒)';
        }

        renderizarTabelaAdmin();
    }

    function renderizarTabelaAdmin() {
        adminTableBody.innerHTML = '';
        if (participantes.length === 0) {
            adminEmptyMessage.classList.remove('hidden');
            return;
        }
        adminEmptyMessage.classList.add('hidden');
        participantes.forEach(p => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="font-weight: 600;">${p.nome}</td>
                <td><a href="https://wa.me/55${p.telefone.replace(/\D/g, '')}" target="_blank" class="admin-tel-link">${p.telefone}</a></td>
                <td>${p.idade} anos</td>
                <td><span class="runner-badge-age" style="display:inline-block;">${p.faixaEtaria}</span></td>
                <td style="text-align: center;">
                    <button class="btn-delete-row" data-id="${p.id}" title="Excluir corredor">
                        <svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                    </button>
                </td>
            `;
            adminTableBody.appendChild(tr);
        });

        document.querySelectorAll('.btn-delete-row').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = e.currentTarget.getAttribute('data-id');
                const p = participantes.find(part => part.id === id);
                if (!p) return;
                if (confirm(`Deseja mesmo remover "${p.nome}" da lista?`)) {
                    await deleteDoc(doc(db, 'participantes', id));
                    exibirToast('Participante removido com sucesso.');
                }
            });
        });
    }

    // LIMPAR LISTA — deleta todos os documentos do Firestore
    btnClearAll.addEventListener('click', async () => {
        if (!isDevMode && !permClearEnabled) { alert('⚠️ Bloqueado pelo Dev!'); return; }
        if (participantes.length === 0) { alert('A lista já está vazia!'); return; }
        if (confirm('⚠️ Apagar TODOS os confirmados?')) {
            if (confirm('Confirmar limpeza definitiva? (Não pode ser desfeita)')) {
                for (const p of participantes) {
                    await deleteDoc(doc(db, 'participantes', p.id));
                }
                exibirToast('Lista reiniciada com sucesso! ⚡');
            }
        }
    });

    // PDF (igual ao anterior)
    btnDownloadPdf.addEventListener('click', () => {
        if (!isDevMode && !permExportEnabled) { alert('⚠️ Bloqueado pelo Dev!'); return; }
        if (participantes.length === 0) { alert('Nenhum participante para gerar PDF!'); return; }

        const dataProximoCorre = calcularDataProximoCorre();
        printDateToday.textContent = `Segunda-feira - ${formatarData(dataProximoCorre)}`;
        printTotalCount.textContent = participantes.length;
        printDateGenerated.textContent = new Date().toLocaleDateString('pt-BR') + ' às ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

        printTableBody.innerHTML = '';
        participantes.forEach((p, index) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="font-weight:bold;width:40px;text-align:center;">${index + 1}</td>
                <td style="font-weight:600;text-transform:uppercase;">${p.nome}</td>
                <td style="font-family:monospace;font-size:10px;">${mascararTelefone(p.telefone)}</td>
                <td style="text-align:center;">${p.idade} anos</td>
                <td style="font-weight:500;">${p.faixaEtaria}</td>
                <td style="border-bottom:1px solid #000!important;width:220px;"></td>
            `;
            printTableBody.appendChild(tr);
        });
        window.print();
    });

    function formatarData(date) {
        return `${String(date.getDate()).padStart(2,'0')}/${String(date.getMonth()+1).padStart(2,'0')}/${date.getFullYear()}`;
    }

    function calcularDataProximoCorre() {
        const agora = new Date();
        const proxima = new Date();
        let dias = (1 - agora.getDay() + 7) % 7;
        if (dias === 0) {
            const limite = new Date();
            limite.setHours(19, 40, 0, 0);
            if (agora > limite) dias = 7;
        }
        proxima.setDate(agora.getDate() + dias);
        proxima.setHours(19, 40, 0, 0);
        return proxima;
    }

    // COUNTDOWN
    const domCdDays = document.getElementById('cd-days');
    const domCdHours = document.getElementById('cd-hours');
    const domCdMin = document.getElementById('cd-min');
    const domCdSec = document.getElementById('cd-sec');

    function tickCountdown() {
        const diff = calcularDataProximoCorre().getTime() - Date.now();
        if (diff <= 0) { domCdDays.textContent = domCdHours.textContent = domCdMin.textContent = domCdSec.textContent = '00'; return; }
        domCdDays.textContent = String(Math.floor(diff / 86400000)).padStart(2, '0');
        domCdHours.textContent = String(Math.floor((diff % 86400000) / 3600000)).padStart(2, '0');
        domCdMin.textContent = String(Math.floor((diff % 3600000) / 60000)).padStart(2, '0');
        domCdSec.textContent = String(Math.floor((diff % 60000) / 1000)).padStart(2, '0');
    }
    tickCountdown();
    setInterval(tickCountdown, 1000);

    // TOAST
    let toastTimeout;
    function exibirToast(msg) {
        clearTimeout(toastTimeout);
        toastMessage.textContent = msg;
        toastNotification.classList.remove('hidden');
        toastTimeout = setTimeout(() => toastNotification.classList.add('hidden'), 4000);
    }

    // CONFIGURAÇÕES DEV
    btnSaveDevSettings.addEventListener('click', () => {
        if (!isDevMode) return;
        const novaSenha = devOrganizerPassInput.value.trim();
        if (novaSenha.length < 3) { alert('Senha deve ter pelo menos 3 caracteres!'); return; }
        organizerPassword = novaSenha;
        permClearEnabled = devPermClear.checked;
        permExportEnabled = devPermExport.checked;
        localStorage.setItem(KEY_ORGANIZER_PASS, organizerPassword);
        localStorage.setItem(KEY_PERM_CLEAR, permClearEnabled);
        localStorage.setItem(KEY_PERM_EXPORT, permExportEnabled);
        exibirToast('Permissões salvas! 🛠️💾');
        renderizarPainelAdmin();
    });
});