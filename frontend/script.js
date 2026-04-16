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
    
    // Elementos da árvore
    const btnToggleTree = document.getElementById('btn-toggle-tree');
    const treeContainer = document.getElementById('tree-container');
    const svgEl = d3.select("#parse-tree-svg");
    let treeData = null;
    let showingTree = false;

    btnToggleTree.addEventListener('click', () => {
        showingTree = !showingTree;
        if (showingTree) {
            syntaxViewers.style.display = 'none';
            treeContainer.style.display = 'block';
            btnToggleTree.textContent = 'Mostrar Tabelas';
        } else {
            syntaxViewers.style.display = 'grid'; // ou flex
            treeContainer.style.display = 'none';
            btnToggleTree.textContent = 'Mostrar Árvore';
        }
    });

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

        if (treeContainer.clientWidth > 0 || showingTree) {
             buildTreeForStep(currentStepIndex);
        }

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

    // ============================
    // ÁRVORE SINTÁTICA D3
    // ============================
    let treeRoot = { name: "<programa>", children: [], active: true };
    // svgEl já foi declarado no topo
    let svgGroup = null;
    let zoomBehavior = null;

    function buildTreeForStep(maxStep) {
        // Recriar modelo de árvore simplificado lendo do 0 ao maxStep
        let idCounter = 0;
        treeRoot = { name: "<programa>", children: null, active: false, id: idCounter++, isNew: (maxStep === 0) };
        let traversalStack = [treeRoot];

        for (let i = 0; i <= maxStep; i++) {
            if (i >= parseSteps.length) break;
            const acao = parseSteps[i].acao;
            const isLatest = (i === maxStep);

            if (acao.startsWith("Expandir") || acao.startsWith("Match")) {
                let targetNode = traversalStack.pop();
                if (!targetNode) continue;

                if (acao.startsWith("Expandir")) {
                    const idxToSplit = acao.indexOf("->");
                    if (idxToSplit !== -1) {
                        const rhs = acao.substring(idxToSplit + 2).trim();
                        if (rhs === "ε") {
                            targetNode.children = [{ name: "ε", id: idCounter++, isNew: isLatest, active: false, children: null }];
                        } else {
                            const symbols = rhs.split(" ");
                            targetNode.children = symbols.map(s => ({
                                name: s,
                                id: idCounter++,
                                isNew: isLatest,
                                active: false,
                                children: null
                            }));
                            // A pilha cresce ao contrário
                            for (let j = symbols.length - 1; j >= 0; j--) {
                                traversalStack.push(targetNode.children[j]);
                            }
                        }
                    }
                } else if (acao.startsWith("Match")) {
                    targetNode.isNew = isLatest; // Focus this as matched
                    targetNode.active = true;
                }
            }
        }
        drawTree();
    }

    function initTree() {
        svgEl.selectAll("*").remove(); // limpar
        svgGroup = svgEl.append("g");
        const tw = treeContainer.clientWidth || 800;
        const th = treeContainer.clientHeight || 500;

        zoomBehavior = d3.zoom().scaleExtent([0.1, 5]).on("zoom", (e) => {
            svgGroup.attr("transform", e.transform);
        });
        svgEl.call(zoomBehavior);

        // centralizar topo inicial
        const initialZoom = d3.zoomIdentity.translate(tw / 2, 40);
        svgEl.call(zoomBehavior.transform, initialZoom);
    }

    function drawTree() {
        if (!svgGroup) initTree();
        const root = d3.hierarchy(treeRoot);
        
        // Aumentando espaço dinamicamente para evitar sobreposição
        const myTree = d3.tree()
            .nodeSize([1, 80])
            .separation((a, b) => {
                const widthA = Math.max(90, a.data.name.length * 8 + 20);
                const widthB = Math.max(90, b.data.name.length * 8 + 20);
                // Distância baseada na largura de ambos os nós, mais margem
                const dist = (widthA + widthB) / 2 + 20; 
                return a.parent === b.parent ? dist : dist + 20;
            });
        
        myTree(root);

        svgGroup.selectAll("*").remove();

        // Links mais visíveis
        svgGroup.selectAll(".link")
            .data(root.links())
            .join("path").attr("class", "link")
            .attr("d", d3.linkVertical().x(d => d.x).y(d => d.y))
            .style("fill", "none")
            .style("stroke", "rgba(150, 150, 150, 0.6)")
            .style("stroke-width", "2px");

        // Nodes
        const nodes = svgGroup.selectAll(".node")
            .data(root.descendants())
            .join("g").attr("class", "node")
            .attr("transform", d => `translate(${d.x},${d.y})`);

        // Usar retângulos em vez de círculos para o texto caber direitinho (dimensionados pelo texto)
        nodes.append("rect")
            .attr("x", d => {
                const w = Math.max(90, d.data.name.length * 8 + 20);
                return -w / 2;
            })
            .attr("y", -16)
            .attr("width", d => Math.max(90, d.data.name.length * 8 + 20))
            .attr("height", 32)
            .attr("rx", 6)
            .attr("ry", 6)
            .style("fill", d => d.data.isNew ? "#f59e0b" : (d.data.active ? "#10b981" : "#1e40af"))
            .style("stroke", d => d.data.isNew ? "#ffffff" : "transparent")
            .style("stroke-width", "2px");

        // Texto com cor branca fixa, fonte mono e centralizado no meio do retângulo
        nodes.append("text").attr("dy", "5")
            .attr("x", 0)
            .style("text-anchor", "middle")
            .style("fill", "#ffffff")
            .style("font-size", "13px")
            .style("font-family", "monospace")
            .style("font-weight", d => d.data.isNew ? "bold" : "normal")
            .style("pointer-events", "none") // o clique/mouse passa pelo texto pra pegar o drag
            .text(d => d.data.name);

        // Autofocus - movendo o zoom para acompanhar o último nó
        const newNode = root.descendants().find(d => d.data.isNew) || root;
        if (newNode && showingTree) {
            const tw = treeContainer.clientWidth || 800;
            const th = treeContainer.clientHeight || 500;
            
            // Pega a escala atual (zoom) do usuário pra não resetar e centraliza exatamente
            const currentScale = d3.zoomTransform(svgEl.node()).k || 1;
            const targetZoom = d3.zoomIdentity
                .translate(tw / 2 - newNode.x * currentScale, (th / 2) - newNode.y * currentScale)
                .scale(currentScale);
            
            svgEl.transition().duration(600).call(
                zoomBehavior.transform, 
                targetZoom
            );
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
