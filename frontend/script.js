document.addEventListener('DOMContentLoaded', () => {
    const scanButton = document.getElementById('btn-scan');
    const parseStartButton = document.getElementById('btn-parse-start');
    const parseStepButton = document.getElementById('btn-parse-step');
    const parseRunButton = document.getElementById('btn-parse-run');
    const parsePauseButton = document.getElementById('btn-parse-pause');
    
    const tabTokens = document.getElementById('tab-tokens');
    const tabSymbols = document.getElementById('tab-symbols');
    const tokensContainer = document.getElementById('tokens-container');
    const symbolsContainer = document.getElementById('symbols-container');

    const sourceCodeInput = document.getElementById('source-code');
    const tokensTable = document.getElementById('tokens-table').querySelector('tbody');
    const symbolsTable = document.getElementById('symbols-table').querySelector('tbody');
    const tokenCount = document.getElementById('token-count');
    const errorContainer = document.getElementById('error-container');
    const errorList = document.getElementById('error-list');

    const API_URL = 'http://127.0.0.1:8000/scan';
    const PARSE_URL = 'http://127.0.0.1:8000/parse-step';

    let parseSteps = [];
    let currentStepIndex = 0;
    let parseInterval = null;
    
    const syntaxViewers = document.getElementById('syntax-viewers');
    const stackView = document.getElementById('stack-view');
    const inputStreamView = document.getElementById('input-stream');
    const derivationLog = document.getElementById('derivation-log');

    tabTokens.addEventListener('click', () => {
        tabTokens.classList.add('active');
        tabSymbols.classList.remove('active');
        tokensContainer.style.display = 'block';
        symbolsContainer.style.display = 'none';
        tabTokens.style.opacity = '1';
        tabSymbols.style.opacity = '0.5';
    });

    tabSymbols.addEventListener('click', () => {
        tabSymbols.classList.add('active');
        tabTokens.classList.remove('active');
        symbolsContainer.style.display = 'block';
        tokensContainer.style.display = 'none';
        tabSymbols.style.opacity = '1';
        tabTokens.style.opacity = '0.5';
    });
    
    tabTokens.style.opacity = '1';
    tabSymbols.style.opacity = '0.5';

    scanButton.addEventListener('click', analyzeCode);
    
    parseStartButton.addEventListener('click', () => runParser(true));
    
    parseRunButton.addEventListener('click', () => {
        if (parseSteps.length > 0 && currentStepIndex < parseSteps.length) {
            parsePauseButton.style.display = 'inline-block';
            parseRunButton.style.display = 'none';
            parseStepButton.style.display = 'none';

            parseInterval = setInterval(() => {
                if (currentStepIndex < parseSteps.length) {
                    renderNextStep();
                } else {
                    clearInterval(parseInterval);
                    parseInterval = null;
                    
                    parsePauseButton.style.display = 'none';
                    parseRunButton.style.display = 'inline-block';
                    parseStepButton.style.display = 'inline-block';
                }
            }, 300);
        } else {
            runParser(false);
        }
    });
    
    parsePauseButton.addEventListener('click', () => {
        if (parseInterval) {
            clearInterval(parseInterval);
            parseInterval = null;
        }
        parsePauseButton.style.display = 'none';
        parseRunButton.style.display = 'inline-block';
        parseStepButton.style.display = 'inline-block';
    });
    
    parseStepButton.addEventListener('click', () => {
        if (parseSteps.length > 0 && currentStepIndex < parseSteps.length) {
            renderNextStep(); 
        } else if (parseSteps.length === 0) {
            alert("Inicie a análise sintática primeiro clicando em 'Começar'.");
        }
    });

    async function analyzeCode() {
        const code = sourceCodeInput.value;
        if (!code.trim()) return;

        setLoading(true);
        clearTable();
        clearErrors();

        try {
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ code: code }),
            });

            if (!response.ok) {
                throw new Error(`Erro: ${response.statusText}`);
            }

            const data = await response.json();
            const tokens = data.tokens;
            const symbol_table = data.symbol_table;
            
            const errorTokens = tokens.filter(t => t.category === 'ERRO_LEXICO');
            const validTokens = tokens.filter(t => t.category !== 'ERRO_LEXICO');

            renderTokens(validTokens);
            renderSymbols(symbol_table);

            if (errorTokens.length > 0) {
                renderErrors(errorTokens);
                errorContainer.style.display = 'flex';
                tokenCount.textContent = `${validTokens.length} tokens | ${errorTokens.length} erros`;
            } else {
                errorContainer.style.display = 'none';
                tokenCount.textContent = `${validTokens.length} tokens | ${symbol_table.length} símbolos`;
            }

        } catch (error) {
            console.error(error);
            showSystemError(error.message);
            tokenCount.textContent = "Erro";
        } finally {
            setLoading(false);
        }
    }

    async function runParser(isStepByStep) {
        const code = sourceCodeInput.value;
        if (!code.trim()) return;

        clearErrors();
        
        try {
            const response = await fetch(PARSE_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code: code }),
            });

            const data = await response.json();
            
            if (data.erro_sintatico && data.passos.length === 0) {
                 showSystemError(data.erro_sintatico);
                 return;
            }

            parseSteps = data.passos;
            currentStepIndex = 0;
            derivationLog.innerHTML = '';
            
            if (parseInterval) {
                clearInterval(parseInterval);
                parseInterval = null;
            }
            
            parsePauseButton.style.display = 'none';
            parseRunButton.style.display = 'inline-block';
            parseStepButton.style.display = 'inline-block';
            
            if (isStepByStep) {
                renderNextStep();
            } else {
                parsePauseButton.style.display = 'inline-block';
                parseRunButton.style.display = 'none';
                parseStepButton.style.display = 'none';
                
                parseInterval = setInterval(() => {
                    if (currentStepIndex < parseSteps.length) {
                        renderNextStep();
                    } else {
                        clearInterval(parseInterval);
                        parseInterval = null;
                        
                        parsePauseButton.style.display = 'none';
                        parseRunButton.style.display = 'inline-block';
                        parseStepButton.style.display = 'inline-block';
                        
                        if (!data.sucesso) {
                            showSystemError(data.erro_sintatico);
                        }
                    }
                }, 300);
            }

        } catch (error) {
            console.error(error);
        }
    }

    function renderNextStep() {
        if (currentStepIndex >= parseSteps.length) return;
        
        const step = parseSteps[currentStepIndex];
        
        stackView.innerHTML = '';
        const reversedStack = [...step.pilha].reverse();
        reversedStack.forEach((simbolo, idx) => {
            const div = document.createElement('div');
            div.className = 'stack-item';
            div.textContent = simbolo;
            if (idx === 0) {
                if (step.status === 'match') {
                    div.style.backgroundColor = 'var(--success)';
                    div.style.color = '#050505';
                    div.style.fontWeight = 'bold';
                } else {
                    div.style.backgroundColor = 'var(--accent-hover)';
                }
            }
            stackView.appendChild(div);
        });

        inputStreamView.innerHTML = '';
        step.entrada.forEach((token, idx) => {
            const span = document.createElement('span');
            span.className = 'input-token';
            span.textContent = token;
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

        const li = document.createElement('li');
        li.textContent = step.acao;
        if (step.status === 'erro') li.style.color = 'var(--error)';
        if (step.status === 'match') li.style.color = 'var(--success)';
        
        derivationLog.appendChild(li);
        derivationLog.scrollTop = derivationLog.scrollHeight;

        currentStepIndex++;
    }

    function renderErrors(errors) {
        errorList.innerHTML = '';
        errors.forEach(err => {
            const li = document.createElement('li');
            li.innerHTML = `<strong>Linha ${err.line}:</strong> ${escapeHtml(err.error || 'Erro léxico desconhecido')}`;
            errorList.appendChild(li);
        });
    }

    function renderTokens(tokens) {
        if (tokens.length === 0) {
            const row = document.createElement('tr');
            row.innerHTML = `<td colspan="3" style="text-align:center; color: var(--text-secondary);">Nenhum token encontrado.</td>`;
            tokensTable.appendChild(row);
            return;
        }

        tokens.forEach(token => {
            const row = document.createElement('tr');
            
            let categoryColor = '';
            if (token.category === 'PALAVRA_RESERVADA') categoryColor = 'color: #c084fc;';
            if (token.category === 'IDENTIFICADOR') categoryColor = 'color: #60a5fa;';
            if (token.category === 'NUMERO') categoryColor = 'color: #facc15;';

            row.innerHTML = `
                <td>${token.line}</td>
                <td style="white-space: pre-wrap;">${escapeHtml(token.lexeme)}</td>
                <td style="${categoryColor}">${token.category}</td>
            `;
            tokensTable.appendChild(row);
        });
    }

    function renderSymbols(symbols) {
        if (symbols.length === 0) {
            const row = document.createElement('tr');
            row.innerHTML = `<td colspan="6" style="text-align:center; color: var(--text-secondary);">Nenhum símbolo (Identificador) encontrado.</td>`;
            symbolsTable.appendChild(row);
            return;
        }

        symbols.forEach(sym => {
            const row = document.createElement('tr');
            const usedColor = sym.usada ? 'color: var(--success);' : 'color: var(--error);';
            const usedText = sym.usada ? 'Sim' : 'Não';
            row.innerHTML = `
                <td>${sym.id}</td>
                <td style="color: #60a5fa; font-weight: bold;">${escapeHtml(sym.nome)}</td>
                <td>${sym.tipo}</td>
                <td>${sym.categoria}</td>
                <td>${sym.valor}</td>
                <td style="${usedColor}">${usedText}</td>
            `;
            symbolsTable.appendChild(row);
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
        errorList.innerHTML = `<li style="color: var(--error)">Erro de Sistema: ${message}</li>`;
    }

    function setLoading(isLoading) {
        if (isLoading) {
            scanButton.textContent = 'Analisando...';
            scanButton.disabled = true;
            scanButton.style.opacity = '0.7';
        } else {
            scanButton.textContent = 'Analisar Código';
            scanButton.disabled = false;
            scanButton.style.opacity = '1';
        }
    }

    function escapeHtml(text) {
        if (!text) return text;
        return text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
});
