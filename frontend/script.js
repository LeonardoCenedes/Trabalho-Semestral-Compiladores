document.addEventListener('DOMContentLoaded', () => {
    // pega todos os elementos que vamos usar
    const scanButton       = document.getElementById('btn-scan');
    const compileButton    = document.getElementById('btn-compile');
    const executeButton    = document.getElementById('btn-execute');
    const parseStartButton = document.getElementById('btn-parse-start');
    const parseStepButton  = document.getElementById('btn-parse-step');
    const parseRunButton   = document.getElementById('btn-parse-run');
    const parsePauseButton = document.getElementById('btn-parse-pause');

    const tabTokens   = document.getElementById('tab-tokens');
    const tabSymbols  = document.getElementById('tab-symbols');
    const tabSemantic = document.getElementById('tab-semantic');

    const tokensContainer   = document.getElementById('tokens-container');
    const symbolsContainer  = document.getElementById('symbols-container');
    const semanticContainer = document.getElementById('semantic-container');
    const semanticPanel     = document.getElementById('semantic-panel');

    const sourceCodeInput = document.getElementById('source-code');
    const tokensTable     = document.getElementById('tokens-table').querySelector('tbody');
    const symbolsTable    = document.getElementById('symbols-table').querySelector('tbody');
    const tokenCount      = document.getElementById('token-count');
    const errorContainer  = document.getElementById('error-container');
    const errorList       = document.getElementById('error-list');

    // seções que só aparecem depois de compilar
    const mepaSectionEl = document.getElementById('mepa-section');
    const mepaList      = document.getElementById('mepa-list');
    const mepaCount     = document.getElementById('mepa-count');

    // Execução
    const execSectionEl   = document.getElementById('exec-section');
    const execInputsArea  = document.getElementById('exec-inputs-area');
    const terminalBody    = document.getElementById('terminal-body');

    // =====================================================================
    // endpoints do backend
    const API_URL      = 'http://127.0.0.1:8000/scan';
    const PARSE_URL    = 'http://127.0.0.1:8000/parse-step';
    const COMPILE_URL  = 'http://127.0.0.1:8000/compile';
    const EXECUTE_URL  = 'http://127.0.0.1:8000/execute';

    // =====================================================================
    // estado do parser passo-a-passo
    let parseSteps       = [];
    let currentStepIndex = 0;
    let parseInterval    = null;
    let currentMepaCode  = [];  // guarda o MEPA gerado pra executar depois

    // =====================================================================
    // elementos da árvore D3
    const syntaxViewers   = document.getElementById('syntax-viewers');
    const stackView       = document.getElementById('stack-view');
    const inputStreamView = document.getElementById('input-stream');
    const derivationLog   = document.getElementById('derivation-log');

    const btnToggleTree = document.getElementById('btn-toggle-tree');
    const treeContainer = document.getElementById('tree-container');
    const svgEl         = d3.select('#parse-tree-svg');
    let showingTree  = false;
    let svgGroup     = null;
    let zoomBehavior = null;

    // =====================================================================
    // troca as abas de tokens / símbolos / semântica
    function activateTab(tabId) {
        [tabTokens, tabSymbols, tabSemantic].forEach(btn => {
            btn.classList.remove('active');
            btn.style.opacity = '0.5';
        });
        [tokensContainer, symbolsContainer, semanticContainer].forEach(el => el.style.display = 'none');

        document.getElementById(tabId + '-btn') && null; // noop
        if (tabId === 'tokens') {
            tabTokens.classList.add('active');   tabTokens.style.opacity = '1';
            tokensContainer.style.display = 'block';
        } else if (tabId === 'symbols') {
            tabSymbols.classList.add('active');  tabSymbols.style.opacity = '1';
            symbolsContainer.style.display = 'block';
        } else if (tabId === 'semantic') {
            tabSemantic.classList.add('active'); tabSemantic.style.opacity = '1';
            semanticContainer.style.display = 'block';
        }
    }

    tabTokens.addEventListener('click',   () => activateTab('tokens'));
    tabSymbols.addEventListener('click',  () => activateTab('symbols'));
    tabSemantic.addEventListener('click', () => activateTab('semantic'));

    // Estado inicial
    tabTokens.style.opacity  = '1';
    tabSymbols.style.opacity = '0.5';
    tabSemantic.style.opacity = '0.5';

    // =====================================================================
    // alterna entre ver a árvore D3 ou as tabelas de pilha/entrada
    btnToggleTree.addEventListener('click', () => {
        showingTree = !showingTree;
        if (showingTree) {
            syntaxViewers.style.display = 'none';
            treeContainer.style.display = 'block';
            btnToggleTree.textContent = 'Mostrar Tabelas';
        } else {
            syntaxViewers.style.display = 'grid';
            treeContainer.style.display = 'none';
            btnToggleTree.textContent = 'Mostrar Árvore';
        }
    });

    // =====================================================================
    // conecta os botões
    scanButton.addEventListener('click', analyzeCode);
    compileButton.addEventListener('click', compileCode);
    executeButton.addEventListener('click', executeCode);
    parseStartButton.addEventListener('click', () => runParser(true));

    parseRunButton.addEventListener('click', () => {
        if (parseSteps.length > 0 && currentStepIndex < parseSteps.length) {
            parsePauseButton.style.display = 'inline-block';
            parseRunButton.style.display   = 'none';
            parseStepButton.style.display  = 'none';
            parseInterval = setInterval(() => {
                if (currentStepIndex < parseSteps.length) {
                    renderNextStep();
                } else {
                    clearInterval(parseInterval); parseInterval = null;
                    parsePauseButton.style.display = 'none';
                    parseRunButton.style.display   = 'inline-block';
                    parseStepButton.style.display  = 'inline-block';
                }
            }, 300);
        } else {
            runParser(false);
        }
    });

    parsePauseButton.addEventListener('click', () => {
        if (parseInterval) { clearInterval(parseInterval); parseInterval = null; }
        parsePauseButton.style.display = 'none';
        parseRunButton.style.display   = 'inline-block';
        parseStepButton.style.display  = 'inline-block';
    });

    parseStepButton.addEventListener('click', () => {
        if (parseSteps.length > 0 && currentStepIndex < parseSteps.length) {
            renderNextStep();
        } else if (parseSteps.length === 0) {
            alert("Inicie a análise sintática primeiro clicando em 'Começar'.");
        }
    });

    // =====================================================================
    // -- análise léxica --
    async function analyzeCode() {
        const code = sourceCodeInput.value;
        if (!code.trim()) return;
        setLoading(scanButton, true, 'Analisando...');
        clearTable();
        clearErrors();

        try {
            const resp = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code }),
            });
            if (!resp.ok) throw new Error(resp.statusText);
            const data = await resp.json();
            const errorTokens = data.tokens.filter(t => t.category === 'ERRO_LEXICO');
            const validTokens = data.tokens.filter(t => t.category !== 'ERRO_LEXICO');
            renderTokens(validTokens);
            renderSymbolsLex(data.symbol_table);
            if (errorTokens.length > 0) {
                renderErrors(errorTokens);
                errorContainer.style.display = 'flex';
                tokenCount.textContent = `${validTokens.length} tokens | ${errorTokens.length} erros`;
            } else {
                errorContainer.style.display = 'none';
                tokenCount.textContent = `${validTokens.length} tokens | ${data.symbol_table.length} símbolos`;
            }
        } catch (err) {
            console.error(err);
            showSystemError(err.message);
            tokenCount.textContent = 'Erro';
        } finally {
            setLoading(scanButton, false, 'Analisar Léxico');
        }
    }

    // =====================================================================
    // -- compilação completa: semântica + geração de código MEPA --
    async function compileCode() {
        const code = sourceCodeInput.value;
        if (!code.trim()) return;
        setLoading(compileButton, true, 'Compilando...');
        clearErrors();

        // Limpa seções MEPA/Execução
        mepaSectionEl.style.display = 'none';
        execSectionEl.style.display = 'none';
        currentMepaCode = [];

        try {
            const resp = await fetch(COMPILE_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code }),
            });
            const data = await resp.json();

            // Atualiza Tabela de Símbolos (com nível e endereço reais)
            renderSymbolsCompile(data.symbol_table || []);

            // Exibe erros/avisos na aba Semântica
            renderSemanticPanel(data.erros || [], data.sucesso);

            // Mostra aba Semântica automaticamente
            activateTab('semantic');
            tokenCount.textContent = data.sucesso ? '✓ Compilação OK' : `✗ ${(data.erros || []).filter(e => e.tipo !== 'aviso').length} erro(s)`;

            if (data.sucesso && data.mepa_code && data.mepa_code.length > 0) {
                currentMepaCode = data.mepa_code;
                renderMepaCode(data.mepa_code);
                mepaSectionEl.style.display = 'block';
                execSectionEl.style.display = 'block';
            }
        } catch (err) {
            console.error(err);
            showSystemError(err.message);
        } finally {
            setLoading(compileButton, false, 'Compilar');
        }
    }

    // =====================================================================
    // -- executa o MEPA gerado na VM --
    async function executeCode() {
        if (currentMepaCode.length === 0) {
            alert('Compile o código primeiro!');
            return;
        }

        const raw = execInputsArea.value.trim();
        const inputs = raw
            ? raw.split('\n').map(s => s.trim()).filter(s => s !== '').map(s => parseInt(s, 10)).filter(n => !isNaN(n))
            : [];

        setLoading(executeButton, true, 'Executando...');
        terminalBody.innerHTML = '<span class="terminal-hint">Executando...</span>';

        try {
            const resp = await fetch(EXECUTE_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mepa_code: currentMepaCode, inputs }),
            });
            const data = await resp.json();
            renderTerminal(data);
            // Destaca instrução atual no MEPA (após execução, não há instrução ativa)
            highlightMepaInstruction(-1);
        } catch (err) {
            terminalBody.innerHTML = `<span class="terminal-error">Erro de conexão: ${escapeHtml(err.message)}</span>`;
        } finally {
            setLoading(executeButton, false, '▶ Executar');
        }
    }

    // =====================================================================
    // -- parser tabular LL1 passo a passo (só pra visualização) --
    async function runParser(isStepByStep) {
        const code = sourceCodeInput.value;
        if (!code.trim()) return;
        clearErrors();

        try {
            const resp = await fetch(PARSE_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code }),
            });
            const data = await resp.json();

            if (data.erro_sintatico && data.passos.length === 0) {
                showSystemError(data.erro_sintatico);
                return;
            }

            parseSteps = data.passos;
            currentStepIndex = 0;
            derivationLog.innerHTML = '';

            if (parseInterval) { clearInterval(parseInterval); parseInterval = null; }

            parsePauseButton.style.display = 'none';
            parseRunButton.style.display   = 'inline-block';
            parseStepButton.style.display  = 'inline-block';

            if (isStepByStep) {
                renderNextStep();
            } else {
                parsePauseButton.style.display = 'inline-block';
                parseRunButton.style.display   = 'none';
                parseStepButton.style.display  = 'none';
                parseInterval = setInterval(() => {
                    if (currentStepIndex < parseSteps.length) {
                        renderNextStep();
                    } else {
                        clearInterval(parseInterval); parseInterval = null;
                        parsePauseButton.style.display = 'none';
                        parseRunButton.style.display   = 'inline-block';
                        parseStepButton.style.display  = 'inline-block';
                        if (!data.sucesso) showSystemError(data.erro_sintatico);
                    }
                }, 300);
            }
        } catch (err) {
            console.error(err);
        }
    }

    function renderNextStep() {
        if (currentStepIndex >= parseSteps.length) return;
        const step = parseSteps[currentStepIndex];

        // Pilha
        stackView.innerHTML = '';
        [...step.pilha].reverse().forEach((sym, idx) => {
            const div = document.createElement('div');
            div.className = 'stack-item';
            div.textContent = sym;
            if (idx === 0) {
                div.style.backgroundColor = step.status === 'match' ? 'var(--success)' : 'var(--accent-hover)';
                if (step.status === 'match') { div.style.color = '#050505'; div.style.fontWeight = 'bold'; }
            }
            stackView.appendChild(div);
        });

        // Entrada restante
        inputStreamView.innerHTML = '';
        step.entrada.forEach((tok, idx) => {
            const span = document.createElement('span');
            span.className = 'input-token';
            span.textContent = tok;
            if (idx === 0) {
                span.style.border = '2px solid var(--accent)';
                if (step.status === 'match') {
                    span.style.backgroundColor = 'var(--success)';
                    span.style.color = '#050505';
                    span.style.fontWeight = 'bold';
                }
            }
            inputStreamView.appendChild(span);
        });

        // Log
        const li = document.createElement('li');
        li.textContent = step.acao;
        if (step.status === 'erro')  li.style.color = 'var(--error)';
        if (step.status === 'match') li.style.color = 'var(--success)';
        derivationLog.appendChild(li);
        derivationLog.scrollTop = derivationLog.scrollHeight;

        if (showingTree) buildTreeForStep(currentStepIndex);
        currentStepIndex++;
    }

    // =====================================================================
    // renderiza a lista de tokens na tabela
    function renderTokens(tokens) {
        tokensTable.innerHTML = '';
        if (tokens.length === 0) {
            tokensTable.innerHTML = `<tr><td colspan="3" style="text-align:center; color:var(--text-secondary);">Nenhum token encontrado.</td></tr>`;
            return;
        }
        tokens.forEach(token => {
            const row = document.createElement('tr');
            let catColor = '';
            if (token.category === 'PALAVRA_RESERVADA') catColor = 'color:#c084fc;';
            if (token.category === 'IDENTIFICADOR')     catColor = 'color:#60a5fa;';
            if (token.category === 'NUMERO')            catColor = 'color:#facc15;';
            if (token.category === 'BOOLEANO')          catColor = 'color:#f97316;';
            if (token.category === 'TIPO')              catColor = 'color:#34d399;';
            row.innerHTML = `
                <td>${token.line}</td>
                <td style="white-space:pre-wrap;">${escapeHtml(token.lexeme)}</td>
                <td style="text-align:right; ${catColor}">${token.category}</td>
            `;
            tokensTable.appendChild(row);
        });
    }

    // =====================================================================
    // tabela de símbolos básica (só léxico, sem nível nem endereço ainda)
    function renderSymbolsLex(symbols) {
        symbolsTable.innerHTML = '';
        if (symbols.length === 0) {
            symbolsTable.innerHTML = `<tr><td colspan="7" style="text-align:center; color:var(--text-secondary);">Nenhum símbolo encontrado.</td></tr>`;
            return;
        }
        symbols.forEach(sym => {
            const row = document.createElement('tr');
            const usedColor = sym.usada ? 'color:var(--success);' : 'color:var(--error);';
            row.innerHTML = `
                <td>${sym.id}</td>
                <td style="color:#60a5fa; font-weight:bold;">${escapeHtml(sym.nome)}</td>
                <td>${sym.tipo || '-'}</td>
                <td>${sym.categoria}</td>
                <td>-</td>
                <td>-</td>
                <td style="${usedColor}">${sym.usada ? 'Sim' : 'Não'}</td>
            `;
            symbolsTable.appendChild(row);
        });
    }

    // =====================================================================
    // tabela de símbolos completa, com nível e endereço que vêm do compilador
    function renderSymbolsCompile(symbols) {
        symbolsTable.innerHTML = '';
        if (symbols.length === 0) {
            symbolsTable.innerHTML = `<tr><td colspan="7" style="text-align:center; color:var(--text-secondary);">Nenhum símbolo encontrado.</td></tr>`;
            return;
        }
        symbols.forEach(sym => {
            const row = document.createElement('tr');
            const usedColor = sym.utilizada ? 'color:var(--success);' : 'color:var(--error);';
            const endColor  = sym.endereco >= 0 ? '' : 'color:var(--text-secondary);';
            row.innerHTML = `
                <td>${sym.id}</td>
                <td style="color:#60a5fa; font-weight:bold;">${escapeHtml(sym.nome)}</td>
                <td>${sym.tipo || '-'}</td>
                <td>${sym.categoria}</td>
                <td>${sym.nivel !== undefined ? sym.nivel : '-'}</td>
                <td style="${endColor}">${sym.endereco >= 0 ? sym.endereco : '-'}</td>
                <td style="${usedColor}">${sym.utilizada ? 'Sim' : 'Não'}</td>
            `;
            symbolsTable.appendChild(row);
        });
    }

    // =====================================================================
    // mostra os erros/avisos semânticos na aba de semântica
    function renderSemanticPanel(erros, sucesso) {
        semanticPanel.innerHTML = '';

        if (sucesso && erros.filter(e => e.tipo !== 'aviso').length === 0) {
            const ok = document.createElement('div');
            ok.className = 'semantic-ok';
            ok.innerHTML = '✓ Análise semântica concluída sem erros.';
            semanticPanel.appendChild(ok);
        }

        if (erros.length === 0) return;

        const list = document.createElement('ul');
        list.className = 'semantic-list';
        erros.forEach(err => {
            const li = document.createElement('li');
            li.className = `semantic-item semantic-${err.tipo}`;
            const icon = err.tipo === 'aviso' ? '⚠' : '✖';
            const label = err.tipo === 'semantico' ? 'Semântico'
                        : err.tipo === 'sintatico'  ? 'Sintático'
                        : err.tipo === 'lexico'      ? 'Léxico'
                        : 'Aviso';
            const linhaStr = err.linha ? ` (Linha ${err.linha})` : '';
            li.innerHTML = `<span class="sem-icon">${icon}</span><span class="sem-label">[${label}${linhaStr}]</span> ${escapeHtml(err.mensagem)}`;
            list.appendChild(li);
        });
        semanticPanel.appendChild(list);
    }

    // =====================================================================
    // lista o código MEPA gerado, instrução por instrução
    function renderMepaCode(mepaCode) {
        mepaList.innerHTML = '';
        mepaCount.textContent = `${mepaCode.length} instruções`;
        mepaCode.forEach((instr, idx) => {
            const div = document.createElement('div');
            div.className = 'mepa-line';
            div.id = `mepa-line-${idx}`;
            const parts = instr.split(' ');
            const op = parts[0];
            const args = parts.slice(1).join(' ');
            div.innerHTML = `<span class="mepa-idx">${String(idx).padStart(3, '0')}</span><span class="mepa-op">${escapeHtml(op)}</span>${args ? `<span class="mepa-arg">${escapeHtml(args)}</span>` : ''}`;
            mepaList.appendChild(div);
        });
    }

    function highlightMepaInstruction(idx) {
        document.querySelectorAll('.mepa-line').forEach(el => el.classList.remove('mepa-line-active'));
        if (idx >= 0) {
            const el = document.getElementById(`mepa-line-${idx}`);
            if (el) { el.classList.add('mepa-line-active'); el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
        }
    }

    // =====================================================================
    // mostra o resultado da execução no terminal
    function renderTerminal(data) {
        terminalBody.innerHTML = '';

        if (data.runtime_error) {
            const errEl = document.createElement('div');
            errEl.className = 'terminal-error';
            errEl.textContent = `✖ Erro em tempo de execução: ${data.runtime_error}`;
            terminalBody.appendChild(errEl);
        }

        if (data.outputs && data.outputs.length > 0) {
            const header = document.createElement('div');
            header.className = 'terminal-output-header';
            header.textContent = 'Saída do programa:';
            terminalBody.appendChild(header);

            data.outputs.forEach(val => {
                const line = document.createElement('div');
                line.className = 'terminal-output-line';
                line.textContent = `> ${val}`;
                terminalBody.appendChild(line);
            });
        } else if (!data.runtime_error) {
            const noOut = document.createElement('div');
            noOut.className = 'terminal-hint';
            noOut.textContent = 'Programa executado sem saída (nenhum write).';
            terminalBody.appendChild(noOut);
        }

        if (data.D_final && data.D_final.length > 0) {
            const memEl = document.createElement('div');
            memEl.className = 'terminal-mem';
            memEl.innerHTML = `<span style="color:var(--text-secondary);">Memória D[]: </span>${data.D_final.join(', ')}`;
            terminalBody.appendChild(memEl);
        }
    }

    // =====================================================================
    // funções auxiliares
    function renderErrors(errors) {
        errorList.innerHTML = '';
        errors.forEach(err => {
            const li = document.createElement('li');
            li.innerHTML = `<strong>Linha ${err.line}:</strong> ${escapeHtml(err.error || 'Erro léxico')}`;
            errorList.appendChild(li);
        });
    }

    function clearTable() {
        tokensTable.innerHTML = '';
        symbolsTable.innerHTML = '';
        tokenCount.textContent = '...';
    }

    function clearErrors() {
        errorList.innerHTML = '';
        errorContainer.style.display = 'none';
    }

    function showSystemError(message) {
        errorContainer.style.display = 'flex';
        errorList.innerHTML = `<li style="color:var(--error)">Erro de Sistema: ${escapeHtml(message)}</li>`;
    }

    function setLoading(btn, isLoading, text) {
        btn.textContent = isLoading ? text : btn.dataset.label || text;
        btn.disabled = isLoading;
        btn.style.opacity = isLoading ? '0.7' : '1';
        if (!isLoading) btn.dataset.label = text;
    }

    function escapeHtml(text) {
        if (!text) return text;
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // =====================================================================
    // -- árvore de derivação com D3 --
    let treeRoot = { name: '<programa>', children: [], active: true };

    function buildTreeForStep(maxStep) {
        let idCounter = 0;
        treeRoot = { name: '<programa>', children: null, active: false, id: idCounter++, isNew: (maxStep === 0) };
        let traversalStack = [treeRoot];

        for (let i = 0; i <= maxStep; i++) {
            if (i >= parseSteps.length) break;
            const acao = parseSteps[i].acao;
            const isLatest = (i === maxStep);

            if (acao.startsWith('Expandir') || acao.startsWith('Match')) {
                let targetNode = traversalStack.pop();
                if (!targetNode) continue;

                if (acao.startsWith('Expandir')) {
                    const idx = acao.indexOf('->');
                    if (idx !== -1) {
                        const rhs = acao.substring(idx + 2).trim();
                        if (rhs === 'eps' || rhs === 'ε') {
                            targetNode.children = [{ name: 'ε', id: idCounter++, isNew: isLatest, active: false, children: null }];
                        } else {
                            const syms = rhs.split(' ');
                            targetNode.children = syms.map(s => ({ name: s, id: idCounter++, isNew: isLatest, active: false, children: null }));
                            for (let j = syms.length - 1; j >= 0; j--) traversalStack.push(targetNode.children[j]);
                        }
                    }
                } else {
                    targetNode.isNew = isLatest;
                    targetNode.active = true;
                }
            }
        }
        drawTree();
    }

    function initTree() {
        svgEl.selectAll('*').remove();
        svgGroup = svgEl.append('g');
        const tw = treeContainer.clientWidth || 800;
        zoomBehavior = d3.zoom().scaleExtent([0.1, 5]).on('zoom', e => svgGroup.attr('transform', e.transform));
        svgEl.call(zoomBehavior);
        svgEl.call(zoomBehavior.transform, d3.zoomIdentity.translate(tw / 2, 40));
    }

    function drawTree() {
        if (!svgGroup) initTree();
        const root = d3.hierarchy(treeRoot);
        const myTree = d3.tree().nodeSize([1, 80]).separation((a, b) => {
            const wA = Math.max(90, a.data.name.length * 8 + 20);
            const wB = Math.max(90, b.data.name.length * 8 + 20);
            const dist = (wA + wB) / 2 + 20;
            return a.parent === b.parent ? dist : dist + 20;
        });
        myTree(root);
        svgGroup.selectAll('*').remove();

        svgGroup.selectAll('.link').data(root.links()).join('path').attr('class', 'link')
            .attr('d', d3.linkVertical().x(d => d.x).y(d => d.y))
            .style('fill', 'none').style('stroke', 'rgba(150,150,150,0.6)').style('stroke-width', '2px');

        const nodes = svgGroup.selectAll('.node').data(root.descendants()).join('g').attr('class', 'node')
            .attr('transform', d => `translate(${d.x},${d.y})`);

        nodes.append('rect')
            .attr('x', d => -(Math.max(90, d.data.name.length * 8 + 20)) / 2)
            .attr('y', -16)
            .attr('width',  d => Math.max(90, d.data.name.length * 8 + 20))
            .attr('height', 32).attr('rx', 6).attr('ry', 6)
            .style('fill', d => d.data.isNew ? '#f59e0b' : (d.data.active ? '#10b981' : '#1e40af'))
            .style('stroke', d => d.data.isNew ? '#ffffff' : 'transparent').style('stroke-width', '2px');

        nodes.append('text').attr('dy', '5').attr('x', 0)
            .style('text-anchor', 'middle').style('fill', '#ffffff').style('font-size', '13px')
            .style('font-family', 'monospace').style('font-weight', d => d.data.isNew ? 'bold' : 'normal')
            .style('pointer-events', 'none').text(d => d.data.name);

        const newNode = root.descendants().find(d => d.data.isNew) || root;
        if (newNode && showingTree) {
            const tw = treeContainer.clientWidth || 800;
            const currentScale = d3.zoomTransform(svgEl.node()).k || 1;
            svgEl.transition().duration(600).call(zoomBehavior.transform,
                d3.zoomIdentity.translate(tw / 2 - newNode.x * currentScale, 200 - newNode.y * currentScale).scale(currentScale));
        }
    }
});
