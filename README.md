# Compilador LALG

Trabalho semestral da disciplina de Compiladores. Implementamos um compilador completo para a linguagem **LALG** — um subconjunto de Pascal usado para fins didáticos — com interface web interativa.

O projeto cobre todas as fases de compilação estudadas em aula: análise léxica, análise sintática (tabular LL(1) com visualização passo a passo), análise semântica, geração de código intermediário (MEPA) e interpretação do código gerado.

---

## Funcionalidades

### Análise Léxica
- Reconhecimento de palavras reservadas, identificadores, números, operadores aritméticos, relacionais e lógicos, delimitadores e booleanos
- Tratamento de comentários de bloco `{ }` e de linha `//`
- Detecção e reporte de erros léxicos com número de linha

### Análise Sintática
- Parser preditivo tabular **LL(1)** com visualização **passo a passo**
- Exibe pilha de símbolos, entrada restante e log de derivações em tempo real
- Visualização da **árvore de derivação** com zoom e pan (D3.js)

### Análise Semântica
- Tabela de símbolos real com controle de **escopo** (nível de aninhamento) e **endereço relativo**
- Parser **recursivo descendente** com gramática completa, incluindo `if/else`, `while`, `procedure` e expressões compostas
- Verificações semânticas implementadas:
  - Variável ou procedimento não declarado
  - Identificador declarado mais de uma vez no mesmo escopo
  - Tipos incompatíveis em atribuições e operações
  - Condição de `if` / `while` não booleana
  - Operadores aritméticos aplicados a booleanos (e vice-versa)
  - `read` com variável não inteira
  - `write` com expressão não inteira
  - Número ou tipo errado de argumentos na chamada de procedimento
  - Aviso para variáveis declaradas e não utilizadas

### Geração de Código (MEPA)
- Geração de código para a **Máquina de Pilha MEPA** durante a análise sintática
- Instruções geradas: `INPP`, `PARA`, `AMEM`, `DMEM`, `CRCT`, `CRVL`, `ARMZ`, `SOMA`, `SUBT`, `MULT`, `DIVI`, `INVR`, `CONJ`, `DISJ`, `NEGA`, `CMIG`, `CMDG`, `CMME`, `CMMA`, `CMEG`, `CMAG`, `DSVS`, `DSVF`, `NADA`, `LEIT`, `IMPR`, `ENPR`, `RTPR`, `CHPR`
- Backpatching automático para desvios condicionais e de laço

### Interpretação (Máquina Virtual MEPA)
- Execução do código MEPA gerado diretamente no browser
- Vetor de código `C`, pilha de dados `D`, instruction pointer `i` e stack pointer `s`
- Terminal interativo: o usuário fornece os valores de `read` e vê as saídas de `write`
- Detecção de erros em tempo de execução (divisão por zero, entradas insuficientes, loop infinito)

---

## Como executar

### Pré-requisitos
- Python 3.8+
- pip

### 1. Instalar dependências do backend

```bash
cd backend
pip install -r requirements.txt
```

### 2. Iniciar o servidor

```bash
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

### 3. Abrir o frontend

Abra o arquivo `frontend/index.html` diretamente no navegador (clique duplo ou arraste para o browser).

O backend precisa estar rodando na porta `8000` para que os botões da interface funcionem.

---

## Estrutura do Projeto

```
.
├── backend/
│   ├── main.py            # Scanner, Parsers, Semântica, CodeGen, MEPA VM e API
│   └── requirements.txt
└── frontend/
    ├── index.html         # Interface web
    ├── script.js          # Lógica do frontend e chamadas à API
    └── style.css          # Estilos
```

---

## Exemplo de programa LALG

```pascal
program fatorial ;
var
  n   : int ;
  fat : int ;
begin
  read(n) ;
  fat := 1 ;
  while n > 1 do
    begin
      fat := fat * n ;
      n   := n - 1
    end ;
  write(fat)
end .
```

---

## Tecnologias

- **Backend:** Python 3, FastAPI, Uvicorn
- **Frontend:** HTML5, CSS3 (Vanilla), JavaScript (ES6+), D3.js

---

## Autores

- Leonardo Cenedes Pereira
- Lucas Cronemberger Domingues
- Giovana dos Santos Pessoa
