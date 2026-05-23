/**
 * CORRE DE CRIA - Lógica da Aplicação Web
 * Autor: Antigravity AI
 * Descrição: Controle de presença, validações (CPF/Idade/Nome), LocalStorage,
 *            Painel de Organizadores, Contagem regressiva e exportação PDF.
 */

document.addEventListener('DOMContentLoaded', () => {

    // ==========================================================================
    // 1. ESTADO GLOBAL DA APLICAÇÃO
    // ==========================================================================
    let participantes = [];
    let isAdminUnlocked = false;
    let isDevMode = false; // Define se o acesso atual é de desenvolvedor master

    // Chaves de Armazenamento LocalStorage
    const STORAGE_KEY = 'corre_de_cria_participantes';
    const KEY_ORGANIZER_PASS = 'corre_de_cria_organizer_password';
    const KEY_PERM_CLEAR = 'corre_de_cria_perm_clear';
    const KEY_PERM_EXPORT = 'corre_de_cria_perm_export';

    // Senha do Desenvolvedor (Master)
    const DEV_MASTER_PASSWORD = '-Cepacol2026';

    // Valores padrão de permissões (carregados dinamicamente)
    let organizerPassword = localStorage.getItem(KEY_ORGANIZER_PASS) || 'Caradebode2026-';
    let permClearEnabled = localStorage.getItem(KEY_PERM_CLEAR) !== 'false'; // Padrão: true
    let permExportEnabled = localStorage.getItem(KEY_PERM_EXPORT) !== 'false'; // Padrão: true

    // ==========================================================================
    // 2. SELETORES DOM
    // ==========================================================================
    
    // Formulário e Inputs
    const formPresenca = document.getElementById('form-presenca');
    const inputNome = document.getElementById('input-nome');
    const inputCpf = document.getElementById('input-cpf');
    const inputIdade = document.getElementById('input-idade');
    
    // Elementos de Erro
    const errorNome = document.getElementById('error-nome');
    const errorCpf = document.getElementById('error-cpf');
    const errorIdade = document.getElementById('error-idade');

    // Listas Públicas
    const publicTotalCount = document.getElementById('public-total-count');
    const searchInput = document.getElementById('search-input');
    const publicListGrid = document.getElementById('public-list-grid');
    const publicEmptyMessage = document.getElementById('public-empty-message');

    // Cabeçalho e Painel Admin
    const btnToggleAdmin = document.getElementById('btn-toggle-admin');
    const adminPanel = document.getElementById('admin-panel');
    const btnCloseAdmin = document.getElementById('btn-close-admin');

    // Modal de Autenticação Admin
    const adminAuthModal = document.getElementById('admin-auth-modal');
    const inputAdminPassword = document.getElementById('input-admin-password');
    const errorAdminPassword = document.getElementById('error-admin-password');
    const btnAuthCancel = document.getElementById('btn-auth-cancel');
    const btnAuthConfirm = document.getElementById('btn-auth-confirm');
    const btnCloseModal = document.getElementById('btn-close-modal');

    // Estatísticas Admin
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

    // Ações Admin & Tabela
    const btnDownloadPdf = document.getElementById('btn-download-pdf');
    const btnClearAll = document.getElementById('btn-clear-all');
    const adminTableBody = document.getElementById('admin-table-body');
    const adminEmptyMessage = document.getElementById('admin-empty-message');

    // Elementos da Máscara de Impressão (PDF)
    const printDateToday = document.getElementById('print-date-today');
    const printTotalCount = document.getElementById('print-total-count');
    const printTableBody = document.getElementById('print-table-body');
    const printDateGenerated = document.getElementById('print-date-generated');

    // Toast de Notificação
    const toastNotification = document.getElementById('toast-notification');
    const toastMessage = document.getElementById('toast-message');

    // Painel do Desenvolvedor (Modo Dev)
    const devSettingsBox = document.getElementById('dev-settings-box');
    const devPermClear = document.getElementById('dev-perm-clear');
    const devPermExport = document.getElementById('dev-perm-export');
    const devOrganizerPassInput = document.getElementById('dev-organizer-pass-input');
    const btnSaveDevSettings = document.getElementById('btn-save-dev-settings');

    // ==========================================================================
    // 3. PERSISTÊNCIA DE DADOS (LOCAL STORAGE)
    // ==========================================================================

    /**
     * Carrega a lista de participantes do localStorage
     */
    function carregarParticipantes() {
        const dados = localStorage.getItem(STORAGE_KEY);
        if (dados) {
            try {
                participantes = JSON.parse(dados);
            } catch (e) {
                console.error("Erro ao ler dados do LocalStorage, reiniciando lista.");
                participantes = [];
            }
        } else {
            participantes = [];
        }
    }

    /**
     * Salva a lista de participantes no localStorage
     */
    function salvarParticipantes() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(participantes));
        atualizarInterface();
    }

    // ==========================================================================
    // 4. MÁSCARAS & VALIDAÇÕES DE FORMULÁRIO (CPF/IDADE/NOME)
    // ==========================================================================

    /**
     * Aplica máscara de CPF em tempo real (Formato: 000.000.000-00)
     */
    inputCpf.addEventListener('input', (e) => {
        let value = e.target.value.replace(/\D/g, ""); // Remove não dígitos
        
        if (value.length > 11) value = value.substring(0, 11);
        
        // Aplica a máscara passo a passo
        if (value.length > 9) {
            value = value.replace(/^(\d{3})(\d{3})(\d{3})(\d{1,2})$/, "$1.$2.$3-$4");
        } else if (value.length > 6) {
            value = value.replace(/^(\d{3})(\d{3})(\d{1,3})$/, "$1.$2.$3");
        } else if (value.length > 3) {
            value = value.replace(/^(\d{3})(\d{1,3})$/, "$1.$2");
        }
        
        e.target.value = value;
    });

    /**
     * Validador oficial de CPF (Algoritmo do Ministério da Fazenda)
     */
    function validarCPF(cpf) {
        // Limpa formatação
        const cpfLimpo = cpf.replace(/\D/g, "");

        if (cpfLimpo.length !== 11) return false;

        // Elimina CPFs conhecidos inválidos
        if (/^(\d)\1{10}$/.test(cpfLimpo)) return false;

        // Valida primeiro dígito verificador
        let soma = 0;
        let resto;
        for (let i = 1; i <= 9; i++) {
            soma += parseInt(cpfLimpo.substring(i - 1, i)) * (11 - i);
        }
        resto = (soma * 10) % 11;
        if (resto === 10 || resto === 11) resto = 0;
        if (resto !== parseInt(cpfLimpo.substring(9, 10))) return false;

        // Valida segundo dígito verificador
        soma = 0;
        for (let i = 1; i <= 10; i++) {
            soma += parseInt(cpfLimpo.substring(i - 1, i)) * (12 - i);
        }
        resto = (soma * 10) % 11;
        if (resto === 10 || resto === 11) resto = 0;
        if (resto !== parseInt(cpfLimpo.substring(10, 11))) return false;

        return true;
    }

    /**
     * Valida o Nome Completo (Pelo menos nome e sobrenome, com no mínimo 2 letras cada)
     */
    function validarNome(nome) {
        const partes = nome.trim().split(/\s+/);
        if (partes.length < 2) return false;
        
        // Garante que cada parte tenha pelo menos 2 caracteres
        return partes.every(parte => parte.length >= 2);
    }

    /**
     * Valida a Idade (Deve estar na faixa entre 5 e 100 anos)
     */
    function validarIdade(idade) {
        const numIdade = parseInt(idade, 10);
        return !isNaN(numIdade) && numIdade >= 5 && numIdade <= 100;
    }

    /**
     * Classifica a idade em Faixas Etárias oficiais do Corre
     */
    function classificarFaixaEtaria(idade) {
        const numIdade = parseInt(idade, 10);
        if (numIdade < 18) return 'Cria Sub-18 (Mirim)';
        if (numIdade >= 18 && numIdade <= 29) return 'Cria 18-29 (Ativo)';
        if (numIdade >= 30 && numIdade <= 45) return 'Cria 30-45 (Adulto)';
        return 'Cria 46+ (Master)';
    }

    /**
     * Mascara o CPF para exibição pública segura (ex: 123.***.***-45)
     */
    function mascararCPF(cpf) {
        const cpfLimpo = cpf.replace(/\D/g, "");
        if (cpfLimpo.length !== 11) return cpf;
        return `${cpfLimpo.substring(0, 3)}.***.***-${cpfLimpo.substring(9, 11)}`;
    }

    // ==========================================================================
    // 5. SUBMISSÃO DE INSCRIÇÃO
    // ==========================================================================

    formPresenca.addEventListener('submit', (e) => {
        e.preventDefault();

        // Valores
        const nomeVal = inputNome.value.trim();
        const cpfVal = inputCpf.value.trim();
        const idadeVal = inputIdade.value.trim();

        let isValido = true;

        // 1. Validação de Nome
        if (!validarNome(nomeVal)) {
            inputNome.parentElement.parentElement.classList.add('invalid');
            isValido = false;
        } else {
            inputNome.parentElement.parentElement.classList.remove('invalid');
        }

        // 2. Validação de CPF
        if (!validarCPF(cpfVal)) {
            errorCpf.textContent = "Insira um CPF válido no formato 000.000.000-00.";
            inputCpf.parentElement.parentElement.classList.add('invalid');
            isValido = false;
        } else {
            // Verificar se o CPF já está na lista
            const cpfExistente = participantes.some(p => p.cpf.replace(/\D/g, "") === cpfVal.replace(/\D/g, ""));
            if (cpfExistente) {
                errorCpf.textContent = "Este CPF já confirmou presença para o corre!";
                inputCpf.parentElement.parentElement.classList.add('invalid');
                isValido = false;
            } else {
                inputCpf.parentElement.parentElement.classList.remove('invalid');
            }
        }

        // 3. Validação de Idade
        if (!validarIdade(idadeVal)) {
            inputIdade.parentElement.parentElement.classList.add('invalid');
            isValido = false;
        } else {
            inputIdade.parentElement.parentElement.classList.remove('invalid');
        }

        // Caso formulário seja válido, prossegue com o cadastro
        if (isValido) {
            const novoParticipante = {
                id: 'cria_' + Date.now(),
                nome: formatarCapitalize(nomeVal),
                cpf: cpfVal,
                idade: parseInt(idadeVal, 10),
                faixaEtaria: classificarFaixaEtaria(idadeVal),
                dataCadastro: new Date().toISOString()
            };

            participantes.push(novoParticipante);
            salvarParticipantes();
            
            // Sucesso
            exibirToast(`Presença confirmada no Corre! Corre de Cria ⚡`);
            formPresenca.reset();
            
            // Remove classes invalid
            document.querySelectorAll('.input-group').forEach(el => el.classList.remove('invalid'));
        }
    });

    /**
     * Capitaliza cada palavra do nome do corredor para ficar elegante
     */
    function formatarCapitalize(str) {
        return str.toLowerCase().replace(/(^\w{1})|(\s+\w{1})/g, letter => letter.toUpperCase());
    }

    // Limpar erros de input ao digitar
    inputNome.addEventListener('input', () => inputNome.parentElement.parentElement.classList.remove('invalid'));
    inputCpf.addEventListener('input', () => inputCpf.parentElement.parentElement.classList.remove('invalid'));
    inputIdade.addEventListener('input', () => inputIdade.parentElement.parentElement.classList.remove('invalid'));

    // ==========================================================================
    // 6. RENDERIZAÇÃO DA INTERFACE & PESQUISA
    // ==========================================================================

    /**
     * Atualiza todas as exibições da interface
     */
    function atualizarInterface() {
        const busca = searchInput.value.toLowerCase().trim();
        
        // 1. Filtrar lista pública
        const participantesFiltrados = participantes.filter(p => p.nome.toLowerCase().includes(busca));
        
        // Renderizar Lista Pública
        renderizarListaPublica(participantesFiltrados);
        
        // Atualizar Totais Públicos
        publicTotalCount.textContent = participantes.length;

        // Se o admin estiver ativo, renderizar os dados administrativos
        if (isAdminUnlocked) {
            renderizarPainelAdmin();
        }
    }

    /**
     * Renderiza o Grid de Cards Públicos
     */
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
            
            // Pegar apenas iniciais da faixa etária para ser compacto no badge público
            const badgeCompacto = p.faixaEtaria.split(' ')[1] || p.faixaEtaria;

            card.innerHTML = `
                <div class="runner-info-left">
                    <span class="runner-name">${p.nome}</span>
                    <span class="runner-cpf">CPF: ${mascararCPF(p.cpf)}</span>
                </div>
                <span class="runner-badge-age">${badgeCompacto}</span>
            `;
            
            publicListGrid.appendChild(card);
        });
    }

    // Monitor do campo de busca pública
    searchInput.addEventListener('input', () => {
        atualizarInterface();
    });

    // ==========================================================================
    // 7. AUTENTICAÇÃO E ÁREA ADMINISTRATIVA
    // ==========================================================================

    /**
     * Abre a autenticação admin ou fecha o painel
     */
    btnToggleAdmin.addEventListener('click', () => {
        if (isAdminUnlocked) {
            // Se já está aberto, fecha o painel admin
            fecharAreaAdmin();
        } else {
            // Abre o modal de autenticação
            abrirModalSenha();
        }
    });

    btnCloseAdmin.addEventListener('click', () => {
        fecharAreaAdmin();
    });

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

    // Eventos do modal de senha
    btnAuthCancel.addEventListener('click', fecharModalSenha);
    btnCloseModal.addEventListener('click', fecharModalSenha);

    btnAuthConfirm.addEventListener('click', processarAutenticacao);
    inputAdminPassword.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') processarAutenticacao();
    });

    function processarAutenticacao() {
        const senhaDigitada = inputAdminPassword.value;
        
        // 1. Caso o login seja feito pelo DEV MASTER (-Cepacol2026)
        if (senhaDigitada === DEV_MASTER_PASSWORD) {
            isAdminUnlocked = true;
            isDevMode = true;
            fecharModalSenha();
            btnToggleAdmin.innerHTML = `
                <svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                    <path d="M7 11V7a5 5 0 0 1 9.9-1"></path>
                </svg>
                <span>Dev Master 🛠️</span>
            `;
            btnToggleAdmin.classList.remove('btn-secondary-outline');
            btnToggleAdmin.classList.add('btn-primary');
            
            adminPanel.classList.remove('hidden');
            devSettingsBox.classList.remove('hidden'); // Exibe a caixa de permissões de dev
            
            // Popula os inputs do painel de dev
            devPermClear.checked = permClearEnabled;
            devPermExport.checked = permExportEnabled;
            devOrganizerPassInput.value = organizerPassword;
            
            adminPanel.scrollIntoView({ behavior: 'smooth' });
            renderizarPainelAdmin();
            exibirToast("Acesso de DESENVOLVEDOR MASTER liberado! 🛠️⚡");
            
        // 2. Caso o login seja feito pelo Organizador comum (Senha dinâmica)
        } else if (senhaDigitada === organizerPassword) {
            isAdminUnlocked = true;
            isDevMode = false;
            fecharModalSenha();
            btnToggleAdmin.innerHTML = `
                <svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                    <path d="M7 11V7a5 5 0 0 1 9.9-1"></path>
                </svg>
                <span>Organizador 🔓</span>
            `;
            btnToggleAdmin.classList.remove('btn-secondary-outline');
            btnToggleAdmin.classList.add('btn-primary');
            
            adminPanel.classList.remove('hidden');
            devSettingsBox.classList.add('hidden'); // Esconde a caixa de dev para organizador comum
            
            adminPanel.scrollIntoView({ behavior: 'smooth' });
            renderizarPainelAdmin();
            exibirToast("Painel de Organizadores liberado! 🔒🔑");
        } else {
            errorAdminPassword.classList.remove('hidden');
            inputAdminPassword.parentElement.classList.add('invalid');
        }
    }

    // Remove erro ao digitar senha
    inputAdminPassword.addEventListener('input', () => {
        errorAdminPassword.classList.add('hidden');
        inputAdminPassword.parentElement.classList.remove('invalid');
    });

    function fecharAreaAdmin() {
        isAdminUnlocked = false;
        isDevMode = false;
        btnToggleAdmin.innerHTML = `
            <svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
            <span>Organizador 🔒</span>
        `;
        btnToggleAdmin.classList.add('btn-secondary-outline');
        btnToggleAdmin.classList.remove('btn-primary');
        adminPanel.classList.add('hidden');
        devSettingsBox.classList.add('hidden');
    }

    // ==========================================================================
    // 8. CÁLCULO E EXIBIÇÃO DE ESTATÍSTICAS DO PAINEL ADMIN
    // ==========================================================================

    function renderizarPainelAdmin() {
        // 1. Totais
        adminStatTotal.textContent = participantes.length;

        // 2. Média de Idade
        if (participantes.length === 0) {
            adminStatAvgAge.textContent = '0';
        } else {
            const somaIdades = participantes.reduce((soma, p) => soma + p.idade, 0);
            adminStatAvgAge.textContent = (somaIdades / participantes.length).toFixed(1);
        }

        // 3. Faixas Etárias
        let sub18 = 0;
        let criaAtivo = 0;
        let criaAdulto = 0;
        let criaMaster = 0;

        participantes.forEach(p => {
            if (p.idade < 18) sub18++;
            else if (p.idade >= 18 && p.idade <= 29) criaAtivo++;
            else if (p.idade >= 30 && p.idade <= 45) criaAdulto++;
            else criaMaster++;
        });

        // Contadores textuais
        countSub18.textContent = sub18;
        countCriaAtivo.textContent = criaAtivo;
        countCriaAdulto.textContent = criaAdulto;
        countCriaMaster.textContent = criaMaster;

        // Barras percentuais
        const total = participantes.length || 1;
        barSub18.style.width = `${(sub18 / total) * 100}%`;
        barCriaAtivo.style.width = `${(criaAtivo / total) * 100}%`;
        barCriaAdulto.style.width = `${(criaAdulto / total) * 100}%`;
        barCriaMaster.style.width = `${(criaMaster / total) * 100}%`;

        // 4. Aplicar Permissões Definidas pelo Dev Master para Organizadores
        if (isDevMode) {
            // Desenvolvedor Master tem acesso total e irrestrito
            btnDownloadPdf.disabled = false;
            btnDownloadPdf.querySelector('span').textContent = 'BAIXAR RELATÓRIO PDF';
            btnClearAll.disabled = false;
            btnClearAll.querySelector('span').textContent = 'LIMPAR LISTA SEMANAL';
        } else {
            // Organizador comum - aplica as permissões definidas pelo Dev
            if (permExportEnabled) {
                btnDownloadPdf.disabled = false;
                btnDownloadPdf.querySelector('span').textContent = 'BAIXAR RELATÓRIO PDF';
            } else {
                btnDownloadPdf.disabled = true;
                btnDownloadPdf.querySelector('span').textContent = 'BAIXAR PDF (BLOQUEADO PELO DEV 🔒)';
            }

            if (permClearEnabled) {
                btnClearAll.disabled = false;
                btnClearAll.querySelector('span').textContent = 'LIMPAR LISTA SEMANAL';
            } else {
                btnClearAll.disabled = true;
                btnClearAll.querySelector('span').textContent = 'LIMPAR LISTA (BLOQUEADO PELO DEV 🔒)';
            }
        }

        // 5. Renderizar a Tabela Completa
        renderizarTabelaAdmin();
    }

    /**
     * Renderiza as linhas da tabela de participantes
     */
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
                <td style="font-family: monospace; letter-spacing: 0.2px;">${p.cpf}</td>
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

        // Configura ouvintes de exclusão individual
        document.querySelectorAll('.btn-delete-row').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.getAttribute('data-id');
                removerParticipante(id);
            });
        });
    }

    /**
     * Remove um participante pelo ID (Com dupla confirmação)
     */
    function removerParticipante(id) {
        const p = participantes.find(part => part.id === id);
        if (!p) return;

        const confirmar = confirm(`Deseja mesmo remover "${p.nome}" da lista de presença?`);
        if (confirmar) {
            participantes = participantes.filter(part => part.id !== id);
            salvarParticipantes();
            exibirToast(`Participante removido com sucesso.`);
        }
    }

    /**
     * Limpa toda a lista semanal (Com dupla confirmação)
     */
    btnClearAll.addEventListener('click', () => {
        if (!isDevMode && !permClearEnabled) {
            alert("⚠️ Esta ação foi desabilitada pelo Desenvolvedor Master!");
            return;
        }

        if (participantes.length === 0) {
            alert("A lista já está vazia!");
            return;
        }

        const conf1 = confirm("⚠️ ATENÇÃO: Você está prestes a apagar TODOS os confirmados da semana. Deseja continuar?");
        if (conf1) {
            const conf2 = confirm("Confirmar limpeza definitiva da lista semanal? (Esta ação não pode ser desfeita)");
            if (conf2) {
                participantes = [];
                salvarParticipantes();
                exibirToast("Lista de presença semanal reiniciada com sucesso! ⚡");
            }
        }
    });

    // ==========================================================================
    // 9. EXPORTAÇÃO E GERAÇÃO DO RELATÓRIO EM PDF (WINDOW.PRINT)
    // ==========================================================================

    btnDownloadPdf.addEventListener('click', () => {
        if (!isDevMode && !permExportEnabled) {
            alert("⚠️ Esta ação foi desabilitada pelo Desenvolvedor Master!");
            return;
        }

        if (participantes.length === 0) {
            alert("Nenhum participante confirmado para gerar o relatório PDF!");
            return;
        }

        // 1. Calcular a data do corre da próxima segunda-feira para o PDF
        const dataProximoCorre = calcularDataProximoCorre();
        const dataFormatadaStr = formatarData(dataProximoCorre);
        printDateToday.textContent = `Segunda-feira - ${dataFormatadaStr}`;

        // 2. Preencher totais e data de geração
        printTotalCount.textContent = participantes.length;
        printDateGenerated.textContent = new Date().toLocaleDateString('pt-BR') + ' às ' + new Date().toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'});

        // 3. Popular Tabela Invisível de Impressão
        printTableBody.innerHTML = '';
        
        participantes.forEach((p, index) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="font-weight: bold; width: 40px; text-align: center;">${index + 1}</td>
                <td style="font-weight: 600; text-transform: uppercase;">${p.nome}</td>
                <td style="font-family: monospace; font-size: 10px;">${mascararCPF(p.cpf)}</td>
                <td style="text-align: center;">${p.idade} anos</td>
                <td style="font-weight: 500;">${p.faixaEtaria}</td>
                <td style="border-bottom: 1px solid #000000 !important; width: 220px;"></td>
            `;
            printTableBody.appendChild(tr);
        });

        // 4. Disparar o fluxo nativo de impressão
        // O navegador aplicará as diretivas de @media print contidas no style.css
        window.print();
    });

    /**
     * Auxiliar: Formata data no formato brasileiro (DD/MM/AAAA)
     */
    function formatarData(date) {
        const dia = String(date.getDate()).padStart(2, '0');
        const mes = String(date.getMonth() + 1).padStart(2, '0');
        const ano = date.getFullYear();
        return `${dia}/${mes}/${ano}`;
    }

    /**
     * Calcula o dia e hora do próximo Corre de segunda às 19:40
     */
    function calcularDataProximoCorre() {
        const agora = new Date();
        const proximaSegunda = new Date();
        
        // Determinar quantos dias faltam para a próxima segunda (1)
        const diaSemana = agora.getDay(); // 0: Dom, 1: Seg, 2: Ter, ...
        let diasFaltantes = (1 - diaSemana + 7) % 7;

        // Se hoje for segunda-feira
        if (diasFaltantes === 0) {
            const limiteCorre = new Date();
            limiteCorre.setHours(19, 40, 0, 0);
            
            // Se já passou das 19:40, pula para a próxima segunda-feira
            if (agora.getTime() > limiteCorre.getTime()) {
                diasFaltantes = 7;
            }
        }

        proximaSegunda.setDate(agora.getDate() + diasFaltantes);
        proximaSegunda.setHours(19, 40, 0, 0);
        
        return proximaSegunda;
    }

    // ==========================================================================
    // 10. CRONÔMETRO DE CONTAGEM REGRESSIVA EM TEMPO REAL
    // ==========================================================================

    const domCdDays = document.getElementById('cd-days');
    const domCdHours = document.getElementById('cd-hours');
    const domCdMin = document.getElementById('cd-min');
    const domCdSec = document.getElementById('cd-sec');

    function tickCountdown() {
        const agora = new Date().getTime();
        const proximoCorre = calcularDataProximoCorre().getTime();
        
        const diferenca = proximoCorre - agora;

        if (diferenca <= 0) {
            // Se chegou a hora do corre, reseta o temporizador
            domCdDays.textContent = '00';
            domCdHours.textContent = '00';
            domCdMin.textContent = '00';
            domCdSec.textContent = '00';
            return;
        }

        // Conversões matemáticas de tempo
        const dias = Math.floor(diferenca / (1000 * 60 * 60 * 24));
        const horas = Math.floor((diferenca % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutos = Math.floor((diferenca % (1000 * 60 * 60)) / (1000 * 60));
        const segundos = Math.floor((diferenca % (1000 * 60)) / 1000);

        // Preenche com zeros à esquerda
        domCdDays.textContent = String(dias).padStart(2, '0');
        domCdHours.textContent = String(horas).padStart(2, '0');
        domCdMin.textContent = String(minutos).padStart(2, '0');
        domCdSec.textContent = String(segundos).padStart(2, '0');
    }

    // Roda a primeira vez e configura intervalo a cada 1 segundo
    tickCountdown();
    setInterval(tickCountdown, 1000);

    // ==========================================================================
    // 11. TOAST NOTIFICATION UTILITY
    // ==========================================================================
    
    let toastTimeout;
    
    function exibirToast(mensagem) {
        clearTimeout(toastTimeout);
        toastMessage.textContent = mensagem;
        toastNotification.classList.remove('hidden');
        
        toastTimeout = setTimeout(() => {
            toastNotification.classList.add('hidden');
        }, 4000);
    }

    // ==========================================================================
    // 12. LÓGICA DE SALVAMENTO DE CONFIGURAÇÕES DE DEV (MODO DEV)
    // ==========================================================================
    btnSaveDevSettings.addEventListener('click', () => {
        if (!isDevMode) return;
        
        const novaSenhaOrg = devOrganizerPassInput.value.trim();
        if (novaSenhaOrg.length < 3) {
            alert("A senha do organizador deve ter pelo menos 3 caracteres!");
            return;
        }

        organizerPassword = novaSenhaOrg;
        permClearEnabled = devPermClear.checked;
        permExportEnabled = devPermExport.checked;

        // Salvar tudo no localStorage
        localStorage.setItem(KEY_ORGANIZER_PASS, organizerPassword);
        localStorage.setItem(KEY_PERM_CLEAR, permClearEnabled);
        localStorage.setItem(KEY_PERM_EXPORT, permExportEnabled);

        exibirToast("Permissões e senha salvas pelo Dev Master! 🛠️💾");
        renderizarPainelAdmin(); // Recarrega os botões com as novas permissões aplicadas
    });

    // ==========================================================================
    // 13. INICIALIZAÇÃO DA PÁGINA
    // ==========================================================================
    carregarParticipantes();
    atualizarInterface();
});
