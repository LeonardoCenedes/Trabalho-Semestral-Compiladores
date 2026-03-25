document.addEventListener('DOMContentLoaded', () => {
    const scanButton = document.getElementById('btn-scan');
    const sourceCodeInput = document.getElementById('source-code');
    const tokensTable = document.getElementById('tokens-table').querySelector('tbody');
    const tokenCount = document.getElementById('token-count');
    const errorContainer = document.getElementById('error-container');
    const errorList = document.getElementById('error-list');

    const API_URL = 'http://127.0.0.1:8000/scan';

    scanButton.addEventListener('click', analyzeCode);

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

            const tokens = await response.json();
            
            // Separate valid tokens and errors
            const errorTokens = tokens.filter(t => t.category === 'ERRO_LEXICO');
            const validTokens = tokens.filter(t => t.category !== 'ERRO_LEXICO');

            renderTokens(validTokens);

            if (errorTokens.length > 0) {
                renderErrors(errorTokens);
                errorContainer.style.display = 'flex';
                tokenCount.textContent = `${validTokens.length} tokens | ${errorTokens.length} erros`;
            } else {
                errorContainer.style.display = 'none';
                tokenCount.textContent = `${validTokens.length} tokens`;
            }

        } catch (error) {
            console.error(error);
            showSystemError(error.message);
            tokenCount.textContent = "Erro";
        } finally {
            setLoading(false);
        }
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
            // Errors are handled separately in renderErrors
            if (token.category === 'ERRO_LEXICO') return;

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

    function clearTable() {
        tokensTable.innerHTML = '';
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
