from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List

app = FastAPI()

# deixa o frontend acessar sem problema de CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# modelos que o FastAPI usa pra receber o JSON do frontend
class SourceCode(BaseModel):
    code: str

class ExecuteRequest(BaseModel):
    mepa_code: List[str]
    inputs: List[int] = []


# ------- Scanner (análise léxica) -------

# palavras reservadas da linguagem LALG
KEYWORDS    = {'program', 'procedure', 'var', 'begin', 'end', 'if', 'then', 'else', 'while', 'do'}
TYPES       = {'int', 'boolean'}
BOOL_CONSTS = {'true', 'false'}
NATIVE_IO   = {'read', 'write'}
LOGICAL_OPS = {'and', 'or', 'not'}
ARITH_OPS   = {'div'}  # só tem div mesmo, * + - ficam separados


class Scanner:
    def __init__(self, source_code: str):
        self.source = source_code
        self.pos = 0
        self.line = 1
        self.tokens = []

    def peek(self):
        if self.pos < len(self.source):
            return self.source[self.pos]
        return None

    def next_char(self):
        if self.pos < len(self.source):
            ch = self.source[self.pos]
            self.pos += 1
            if ch == '\n':
                self.line += 1
            return ch
        return None

    def advance(self):
        self.next_char()

    def add_token(self, lexeme, category, line, error=None):
        self.tokens.append({"line": line, "lexeme": lexeme, "category": category, "error": error})

    def scan(self):
        while self.peek() is not None:
            ch = self.peek()

            if ch.isspace():
                self.advance()
                continue

            if ch == '{':
                self.advance()
                while self.peek() is not None and self.peek() != '}':
                    self.advance()
                if self.peek() == '}':
                    self.advance()
                else:
                    self.add_token("{", "ERRO_LEXICO", self.line, "Comentario nao fechado")
                continue

            if ch == '/':
                self.advance()
                if self.peek() == '/':
                    while self.peek() is not None and self.peek() != '\n':
                        self.advance()
                else:
                    self.add_token("/", "ERRO_LEXICO", self.line, "Caractere inesperado '/'")
                continue

            if ch.isalpha() or ch == '_':
                start_line = self.line
                lexeme = ""
                while self.peek() is not None and (self.peek().isalnum() or self.peek() == '_'):
                    lexeme += self.next_char()
                if lexeme in KEYWORDS:
                    self.add_token(lexeme, "PALAVRA_RESERVADA", start_line)
                elif lexeme in TYPES:
                    self.add_token(lexeme, "TIPO", start_line)
                elif lexeme in BOOL_CONSTS:
                    self.add_token(lexeme, "BOOLEANO", start_line)
                elif lexeme in NATIVE_IO:
                    self.add_token(lexeme, "PROCEDIMENTO", start_line)
                elif lexeme in LOGICAL_OPS:
                    self.add_token(lexeme, "OPERADOR_LOGICO", start_line)
                elif lexeme in ARITH_OPS:
                    self.add_token(lexeme, "OPERADOR_ARITMETICO", start_line)
                else:
                    self.add_token(lexeme, "IDENTIFICADOR", start_line)
                continue

            if ch.isdigit():
                start_line = self.line
                lexeme = ""
                while self.peek() is not None and self.peek().isdigit():
                    lexeme += self.next_char()
                self.add_token(lexeme, "NUMERO", start_line)
                continue

            if ch == ':':
                start_line = self.line
                self.advance()
                if self.peek() == '=':
                    self.advance()
                    self.add_token(":=", "ATRIBUICAO", start_line)
                else:
                    self.add_token(":", "DELIMITADOR", start_line)
                continue

            if ch == '<':
                start_line = self.line
                self.advance()
                if self.peek() == '=':
                    self.advance()
                    self.add_token("<=", "OPERADOR_RELACIONAL", start_line)
                elif self.peek() == '>':
                    self.advance()
                    self.add_token("<>", "OPERADOR_RELACIONAL", start_line)
                else:
                    self.add_token("<", "OPERADOR_RELACIONAL", start_line)
                continue

            if ch == '>':
                start_line = self.line
                self.advance()
                if self.peek() == '=':
                    self.advance()
                    self.add_token(">=", "OPERADOR_RELACIONAL", start_line)
                else:
                    self.add_token(">", "OPERADOR_RELACIONAL", start_line)
                continue

            if ch in {'+', '-', '*'}:
                self.add_token(self.next_char(), "OPERADOR_ARITMETICO", self.line)
                continue

            if ch == '=':
                self.add_token(self.next_char(), "OPERADOR_RELACIONAL", self.line)
                continue

            if ch in {'.', ';', ',', '(', ')', '[', ']'}:
                self.add_token(self.next_char(), "DELIMITADOR", self.line)
                continue

            invalid = self.next_char()
            self.add_token(invalid, "ERRO_LEXICO", self.line, f"Caractere '{invalid}' nao reconhecido")

        return self.tokens


# ------- Analisador Sintático Tabular LL(1) -------
# usado no endpoint /parse-step pra mostrar passo a passo na tela
# a tabela só cobre uma gramática simplificada — o compilador de verdade
# usa o RecursiveParser lá embaixo

TERMINAL_MAP = {
    "program": "program", ";": ";", ".": ".", "begin": "begin", "end": "end",
    "var": "var", ":": ":", ":=": ":=", "(": "(", ")": ")", "read": "read",
    "write": "write", "IDENTIFICADOR": "id", "NUMERO": "num", "TIPO": "tipo",
}

LL1_TABLE = {
    "<programa>": {"program": ["program", "id", ";", "<bloco>", "."]},
    "<bloco>": {
        "var":   ["<parte_declaracoes_vars>", "<comando_composto>"],
        "begin": ["<comando_composto>"]
    },
    "<parte_declaracoes_vars>": {
        "var": ["var", "id", ":", "tipo", ";", "<mais_declaracoes>"]
    },
    "<mais_declaracoes>": {
        "id":    ["id", ":", "tipo", ";", "<mais_declaracoes>"],
        "begin": []
    },
    "<comando_composto>": {
        "begin": ["begin", "<comandos>", "end"]
    },
    "<comandos>": {
        "id": ["<comando>", ";", "<mais_comandos>"],
        "read": ["<comando>", ";", "<mais_comandos>"],
        "write": ["<comando>", ";", "<mais_comandos>"],
        "end": []
    },
    "<mais_comandos>": {
        "id": ["<comando>", ";", "<mais_comandos>"],
        "read": ["<comando>", ";", "<mais_comandos>"],
        "write": ["<comando>", ";", "<mais_comandos>"],
        "end": []
    },
    "<comando>": {
        "id":    ["id", ":=", "<expressao>"],
        "read":  ["read", "(", "id", ")"],
        "write": ["write", "(", "<expressao>", ")"]
    },
    "<expressao>": {
        "num": ["num"],
        "id":  ["id"]
    }
}


def map_token_to_terminal(token: dict) -> str:
    lexeme = token['lexeme']
    category = token['category']
    if lexeme in TERMINAL_MAP:
        return TERMINAL_MAP[lexeme]
    if category in TERMINAL_MAP:
        return TERMINAL_MAP[category]
    return lexeme


class TabelarParser:
    def __init__(self, tokens):
        self.tokens = tokens
        self.input_stream = [map_token_to_terminal(t) for t in tokens if t['category'] != 'ERRO_LEXICO'] + ["$"]
        self.stack = ["$", "<programa>"]
        self.steps = []
        self.success = True
        self.error_msg = None

    def parse(self):
        index = 0
        while len(self.stack) > 0:
            top = self.stack[-1]
            current = self.input_stream[index]
            step = {"pilha": self.stack.copy(), "entrada": self.input_stream[index:], "acao": "", "status": "processando"}

            if top == "$" and current == "$":
                step["acao"] = "Analise concluida com sucesso."
                step["status"] = "sucesso"
                self.stack.pop()
                self.steps.append(step)
                break
            elif top == current:
                step["acao"] = f"Match: {top}"
                step["status"] = "match"
                self.stack.pop()
                index += 1
            elif top in LL1_TABLE:
                if current in LL1_TABLE[top]:
                    prod = LL1_TABLE[top][current]
                    step["acao"] = f"Expandir {top} -> {' '.join(prod) if prod else 'eps'}"
                    self.stack.pop()
                    for sym in reversed(prod):
                        self.stack.append(sym)
                else:
                    self.success = False
                    self.error_msg = f"Erro Sintatico: Token '{current}' inesperado. Nao ha transicao para M[{top}, {current}]."
                    step["acao"] = self.error_msg
                    step["status"] = "erro"
                    self.steps.append(step)
                    break
            else:
                self.success = False
                self.error_msg = f"Erro Sintatico: Token '{current}' nao esperado. Esperava '{top}'."
                step["acao"] = self.error_msg
                step["status"] = "erro"
                self.steps.append(step)
                break

            self.steps.append(step)

        return {"passos": self.steps, "sucesso": self.success, "erro_sintatico": self.error_msg}


# exceção customizada pra carregar a mensagem e a linha junto
class SemanticError(Exception):
    def __init__(self, message, line=None):
        self.message = message
        self.line = line
        super().__init__(message)


# ------- Tabela de Símbolos -------

class Symbol:
    # representa uma entrada na tabela de símbolos
    # passagem = 'valor' ou 'referencia' (só importa pra parâmetros)
    def __init__(self, nome, categoria, tipo, nivel, endereco, passagem='valor'):
        self.nome = nome
        self.categoria = categoria  # 'variavel', 'procedimento', 'parametro', 'programa'
        self.tipo = tipo
        self.nivel = nivel
        self.endereco = endereco
        self.passagem = passagem
        self.utilizada = False
        self.params = []  # lista de Symbol, só pra procedimentos


class SymbolTable:
    def __init__(self):
        self.symbols = []
        self.nivel_atual = 0
        self._addr = {0: 0}

    def inserir(self, sym):
        for s in self.symbols:
            if s.nome == sym.nome and s.nivel == self.nivel_atual:
                raise SemanticError(f"Identificador '{sym.nome}' ja declarado neste escopo.")
        self.symbols.append(sym)

    def buscar(self, nome, linha=None):
        for s in reversed(self.symbols):
            if s.nome == nome:
                return s
        raise SemanticError(f"Identificador '{nome}' nao declarado.", linha)

    def entrar_escopo(self):
        self.nivel_atual += 1
        self._addr[self.nivel_atual] = 0

    def sair_escopo(self):
        removed = [s for s in self.symbols if s.nivel == self.nivel_atual]
        self.symbols = [s for s in self.symbols if s.nivel != self.nivel_atual]
        if self.nivel_atual in self._addr:
            del self._addr[self.nivel_atual]
        self.nivel_atual -= 1
        return removed

    def proximo_endereco(self):
        # retorna o endereço relativo e já incrementa o contador do nível atual
        addr = self._addr.get(self.nivel_atual, 0)
        self._addr[self.nivel_atual] = addr + 1
        return addr

    def to_list(self):
        result = []
        for i, s in enumerate(self.symbols):
            result.append({
                "id": i + 1,
                "nome": s.nome,
                "tipo": s.tipo if s.tipo else "-",
                "categoria": s.categoria,
                "nivel": s.nivel,
                "endereco": s.endereco,
                "utilizada": s.utilizada,
            })
        return result


# ------- Gerador de Código MEPA -------

class CodeGenerator:
    def __init__(self):
        self.codigo = []

    def emitir(self, op, *args):
        # devolve o índice da instrução emitida — útil pro backpatching de desvios
        idx = len(self.codigo)
        if args:
            self.codigo.append(f"{op} {' '.join(str(a) for a in args)}")
        else:
            self.codigo.append(op)
        return idx

    def corrigir(self, idx, novo_endereco):
        # backpatching: substitui o '?' que ficou pendente no desvio
        parts = self.codigo[idx].split()
        parts[-1] = str(novo_endereco)
        self.codigo[idx] = ' '.join(parts)

    def proximo_indice(self):
        return len(self.codigo)


# ------- Analisador Recursivo Descendente -------
# faz análise sintática + semântica + geração de código numa passagem só
# a gramática aqui é mais completa que a tabela LL(1) acima

class RecursiveParser:
    def __init__(self, tokens):
        # filtra os erros léxicos, eles já foram reportados antes
        self.tokens = [t for t in tokens if t['category'] != 'ERRO_LEXICO']
        self.pos = 0
        self.st = SymbolTable()
        self.gen = CodeGenerator()
        self.erros = []
        self.avisos = []

    def tok(self):
        if self.pos < len(self.tokens):
            return self.tokens[self.pos]
        return {'lexeme': '$', 'category': 'EOF', 'line': 0}

    def linha(self):
        return self.tok().get('line', 0)

    def consume(self, lexeme=None, category=None):
        t = self.tok()
        if lexeme and t['lexeme'] != lexeme:
            raise SyntaxError(f"Linha {t['line']}: Esperava '{lexeme}', encontrou '{t['lexeme']}'.")
        if category and t['category'] != category:
            raise SyntaxError(f"Linha {t['line']}: Esperava {category}, encontrou '{t['lexeme']}'.")
        self.pos += 1
        return t

    def consume_id(self):
        return self.consume(category='IDENTIFICADOR')

    def add_semantic_error(self, msg, linha=None):
        self.erros.append({"tipo": "semantico", "mensagem": msg, "linha": linha})

    def add_aviso(self, msg, linha=None):
        self.avisos.append({"tipo": "aviso", "mensagem": msg, "linha": linha})

    def parse(self):
        try:
            self.programa()
        except SyntaxError as e:
            self.erros.insert(0, {"tipo": "sintatico", "mensagem": str(e), "linha": None})
        except SemanticError as e:
            self.erros.insert(0, {"tipo": "semantico", "mensagem": e.message, "linha": e.line})

        todos_erros = self.erros + self.avisos
        tem_erro = any(e['tipo'] in ('sintatico', 'semantico') for e in self.erros)

        return {
            "sucesso": not tem_erro,
            "erros": todos_erros,
            "mepa_code": self.gen.codigo if not tem_erro else [],
            "symbol_table": self.st.to_list(),
        }

    # -- regras gramaticais, seguindo o que foi visto em aula --

    def programa(self):
        self.gen.emitir('INPP')
        self.consume('program')
        tok_id = self.consume_id()
        prog_sym = Symbol(tok_id['lexeme'], 'programa', None, 0, -1)
        self.st.inserir(prog_sym)
        self.consume(';')
        self.bloco_principal()
        self.consume('.')
        self.gen.emitir('PARA')

    def bloco_principal(self):
        n_vars = self.parte_decl_vars(nivel=0)
        if n_vars > 0:
            self.gen.emitir('AMEM', n_vars)  # aloca espaço pro escopo global
        self.parte_decl_procs(nivel=0)
        self.comando_composto()

    def bloco_proc(self, nivel):
        n_vars = self.parte_decl_vars(nivel=nivel)
        if n_vars > 0:
            self.gen.emitir('AMEM', n_vars)
        self.parte_decl_procs(nivel=nivel)
        self.comando_composto()
        if n_vars > 0:
            self.gen.emitir('DMEM', n_vars)
        return n_vars

    def parte_decl_vars(self, nivel):
        count = 0
        if self.tok()['lexeme'] == 'var':
            self.consume('var')
            count += self.decl_var(nivel)
            self.consume(';')
            while self.tok()['category'] == 'IDENTIFICADOR':
                count += self.decl_var(nivel)
                self.consume(';')
        return count

    def decl_var(self, nivel):
        ids = self.lista_ids()
        self.consume(':')
        tipo = self.tipo()
        for nome in ids:
            addr = self.st.proximo_endereco()
            sym = Symbol(nome, 'variavel', tipo, nivel, addr)
            try:
                self.st.inserir(sym)
            except SemanticError as e:
                self.add_semantic_error(e.message, self.linha())
        return len(ids)

    def lista_ids(self):
        ids = [self.consume_id()['lexeme']]
        while self.tok()['lexeme'] == ',':
            self.consume(',')
            ids.append(self.consume_id()['lexeme'])
        return ids

    def tipo(self):
        t = self.tok()
        if t['category'] == 'TIPO':
            self.pos += 1
            return t['lexeme']
        raise SyntaxError(f"Linha {t['line']}: Tipo esperado ('int' ou 'boolean'), encontrou '{t['lexeme']}'.")

    def parte_decl_procs(self, nivel):
        # emite um DSVS pra pular o corpo do proc durante a execução normal
        while self.tok()['lexeme'] == 'procedure':
            self.consume('procedure')
            tok_id = self.consume_id()
            nome_proc = tok_id['lexeme']

            idx_dsvs = self.gen.emitir('DSVS', '?')
            entry_point = self.gen.proximo_indice()
            self.gen.emitir('ENPR', nivel + 1)

            self.st.entrar_escopo()
            novo_nivel = self.st.nivel_atual

            params = self.params_formais(novo_nivel)

            self.st.nivel_atual = nivel
            proc_sym = Symbol(nome_proc, 'procedimento', None, nivel, entry_point)
            proc_sym.params = params
            try:
                self.st.inserir(proc_sym)
            except SemanticError as e:
                self.add_semantic_error(e.message, tok_id['line'])
            self.st.nivel_atual = novo_nivel

            self.consume(';')
            self.bloco_proc(nivel=novo_nivel)
            self.gen.emitir('RTPR', novo_nivel, len(params))

            self.gen.corrigir(idx_dsvs, self.gen.proximo_indice())

            removidos = self.st.sair_escopo()
            # avisa se ficou variável declarada sem uso — não bloqueia a compilação
            for sym in removidos:
                if sym.categoria in ('variavel', 'parametro') and not sym.utilizada:
                    self.add_aviso(f"'{sym.nome}' declarado mas nunca utilizado (nivel {sym.nivel}).")

            self.consume(';')

    def params_formais(self, nivel):
        params = []
        if self.tok()['lexeme'] == '(':
            self.consume('(')
            params += self.secao_params(nivel)
            while self.tok()['lexeme'] == ';':
                self.consume(';')
                params += self.secao_params(nivel)
            self.consume(')')
        return params

    def secao_params(self, nivel):
        passagem = 'valor'
        if self.tok()['lexeme'] == 'var':
            self.consume('var')
            passagem = 'referencia'
        ids = self.lista_ids()
        self.consume(':')
        tipo = self.tipo()
        params = []
        for nome in ids:
            addr = self.st.proximo_endereco()
            sym = Symbol(nome, 'parametro', tipo, nivel, addr, passagem)
            try:
                self.st.inserir(sym)
            except SemanticError as e:
                self.add_semantic_error(e.message, self.linha())
            params.append(sym)
        return params

    def comando_composto(self):
        self.consume('begin')
        self.comandos()
        self.consume('end')

    def comandos(self):
        t = self.tok()
        if t['lexeme'] in ('end', '$') or t['category'] == 'EOF':
            return
        self.comando()
        while self.tok()['lexeme'] == ';':
            self.consume(';')
            t = self.tok()
            if t['lexeme'] in ('end', '$') or t['category'] == 'EOF':
                break
            self.comando()

    def comando(self):
        # despacha pro tipo certo de comando com base no token atual
        t = self.tok()

        if t['category'] == 'IDENTIFICADOR':
            tok_id = self.consume_id()
            nome = tok_id['lexeme']
            try:
                sym = self.st.buscar(nome, tok_id['line'])
            except SemanticError as e:
                self.add_semantic_error(e.message, tok_id['line'])
                # tenta recuperar consumindo a atribuição pra não travar o parser
                if self.tok()['lexeme'] == ':=':
                    self.consume(':=')
                    self.expressao()
                return

            sym.utilizada = True

            if self.tok()['lexeme'] == ':=':
                self.consume(':=')
                tipo_expr = self.expressao()
                if sym.tipo and tipo_expr and sym.tipo != tipo_expr:
                    self.add_semantic_error(
                        f"Linha {tok_id['line']}: Tipos incompativeis: '{nome}' e '{sym.tipo}', expressao retornou '{tipo_expr}'.",
                        tok_id['line']
                    )
                self.gen.emitir('ARMZ', sym.nivel, sym.endereco)

            elif self.tok()['lexeme'] == '(':
                if sym.categoria != 'procedimento':
                    self.add_semantic_error(
                        f"Linha {tok_id['line']}: '{nome}' nao e um procedimento.",
                        tok_id['line']
                    )
                self.consume('(')
                arg_tipos = []
                if self.tok()['lexeme'] != ')':
                    arg_tipos.append(self.expressao())
                    while self.tok()['lexeme'] == ',':
                        self.consume(',')
                        arg_tipos.append(self.expressao())
                self.consume(')')
                n_formal = len(sym.params)
                if len(arg_tipos) != n_formal:
                    self.add_semantic_error(
                        f"Linha {tok_id['line']}: '{nome}' esperava {n_formal} argumento(s), recebeu {len(arg_tipos)}.",
                        tok_id['line']
                    )
                else:
                    for i, (at, fp) in enumerate(zip(arg_tipos, sym.params)):
                        if at != fp.tipo:
                            self.add_semantic_error(
                                f"Linha {tok_id['line']}: Argumento {i+1} de '{nome}': esperava '{fp.tipo}', recebeu '{at}'.",
                                tok_id['line']
                            )
                self.gen.emitir('CHPR', sym.nivel, sym.endereco)

            else:
                raise SyntaxError(f"Linha {tok_id['line']}: Esperava ':=' ou '(' apos '{nome}'.")

        elif t['lexeme'] == 'if':
            self.consume('if')
            tipo_cond = self.expressao()
            if tipo_cond != 'boolean':
                self.add_semantic_error(
                    f"Linha {t['line']}: Condicao do 'if' deve ser booleana, recebeu '{tipo_cond}'.",
                    t['line']
                )
            self.consume('then')
            idx_dsvf = self.gen.emitir('DSVF', '?')
            self.comando()
            if self.tok()['lexeme'] == 'else':
                idx_dsvs = self.gen.emitir('DSVS', '?')
                self.gen.corrigir(idx_dsvf, self.gen.proximo_indice())
                self.consume('else')
                self.comando()
                self.gen.corrigir(idx_dsvs, self.gen.proximo_indice())
            else:
                self.gen.corrigir(idx_dsvf, self.gen.proximo_indice())

        elif t['lexeme'] == 'while':
            self.consume('while')
            idx_inicio = self.gen.emitir('NADA')
            tipo_cond = self.expressao()
            if tipo_cond != 'boolean':
                self.add_semantic_error(
                    f"Linha {t['line']}: Condicao do 'while' deve ser booleana, recebeu '{tipo_cond}'.",
                    t['line']
                )
            idx_dsvf = self.gen.emitir('DSVF', '?')
            self.consume('do')
            self.comando()
            self.gen.emitir('DSVS', idx_inicio)
            self.gen.corrigir(idx_dsvf, self.gen.proximo_indice())

        elif t['lexeme'] == 'read':
            self.consume('read')
            self.consume('(')
            tok_id = self.consume_id()
            try:
                sym = self.st.buscar(tok_id['lexeme'], tok_id['line'])
                sym.utilizada = True
                if sym.tipo != 'int':
                    self.add_semantic_error(
                        f"Linha {tok_id['line']}: 'read' aceita apenas inteiros; '{tok_id['lexeme']}' e '{sym.tipo}'.",
                        tok_id['line']
                    )
                self.gen.emitir('LEIT')
                self.gen.emitir('ARMZ', sym.nivel, sym.endereco)
            except SemanticError as e:
                self.add_semantic_error(e.message, tok_id['line'])
            self.consume(')')

        elif t['lexeme'] == 'write':
            self.consume('write')
            self.consume('(')
            tipo_expr = self.expressao()
            if tipo_expr != 'int':
                self.add_semantic_error(
                    f"Linha {t['line']}: 'write' aceita apenas expressoes inteiras; recebeu '{tipo_expr}'.",
                    t['line']
                )
            self.consume(')')
            self.gen.emitir('IMPR')

        elif t['lexeme'] == 'begin':
            self.comando_composto()

        else:
            raise SyntaxError(f"Linha {t['line']}: Comando invalido: '{t['lexeme']}'.")

    def expressao(self):
        # expressao -> expressao_simples [ op_relacional expressao_simples ]
        tipo = self.expressao_simples()
        t = self.tok()
        if t['category'] == 'OPERADOR_RELACIONAL':
            op = t['lexeme']
            self.pos += 1
            tipo2 = self.expressao_simples()
            if tipo != tipo2:
                self.add_semantic_error(
                    f"Linha {t['line']}: Tipos incompativeis na comparacao '{op}': '{tipo}' e '{tipo2}'.",
                    t['line']
                )
            op_map = {'=': 'CMIG', '<>': 'CMDG', '<': 'CMME', '<=': 'CMEG', '>': 'CMMA', '>=': 'CMAG'}
            self.gen.emitir(op_map.get(op, 'CMIG'))
            return 'boolean'
        return tipo

    def expressao_simples(self):
        # trata sinal unário e operadores + - or
        sinal = None
        t = self.tok()
        if t['category'] == 'OPERADOR_ARITMETICO' and t['lexeme'] in ('+', '-'):
            sinal = t['lexeme']
            self.pos += 1

        tipo = self.termo()

        if sinal == '-':
            if tipo != 'int':
                self.add_semantic_error(f"Linha {t['line']}: Operador unario '-' requer inteiro.", t['line'])
            self.gen.emitir('INVR')

        while True:
            t = self.tok()
            if t['category'] == 'OPERADOR_ARITMETICO' and t['lexeme'] in ('+', '-'):
                op = t['lexeme']
                self.pos += 1
                tipo2 = self.termo()
                if tipo != 'int' or tipo2 != 'int':
                    self.add_semantic_error(f"Linha {t['line']}: Operador '{op}' requer inteiros.", t['line'])
                self.gen.emitir('SOMA' if op == '+' else 'SUBT')
                tipo = 'int'
            elif t['category'] == 'OPERADOR_LOGICO' and t['lexeme'] == 'or':
                self.pos += 1
                tipo2 = self.termo()
                if tipo != 'boolean' or tipo2 != 'boolean':
                    self.add_semantic_error(f"Linha {t['line']}: Operador 'or' requer booleanos.", t['line'])
                self.gen.emitir('DISJ')
                tipo = 'boolean'
            else:
                break

        return tipo

    def termo(self):
        tipo = self.fator()

        while True:
            t = self.tok()
            if t['category'] == 'OPERADOR_ARITMETICO' and t['lexeme'] == '*':
                self.pos += 1
                tipo2 = self.fator()
                if tipo != 'int' or tipo2 != 'int':
                    self.add_semantic_error(f"Linha {t['line']}: Operador '*' requer inteiros.", t['line'])
                self.gen.emitir('MULT')
                tipo = 'int'
            elif t['category'] == 'OPERADOR_ARITMETICO' and t['lexeme'] == 'div':
                self.pos += 1
                tipo2 = self.fator()
                if tipo != 'int' or tipo2 != 'int':
                    self.add_semantic_error(f"Linha {t['line']}: Operador 'div' requer inteiros.", t['line'])
                self.gen.emitir('DIVI')
                tipo = 'int'
            elif t['category'] == 'OPERADOR_LOGICO' and t['lexeme'] == 'and':
                self.pos += 1
                tipo2 = self.fator()
                if tipo != 'boolean' or tipo2 != 'boolean':
                    self.add_semantic_error(f"Linha {t['line']}: Operador 'and' requer booleanos.", t['line'])
                self.gen.emitir('CONJ')
                tipo = 'boolean'
            else:
                break

        return tipo

    def fator(self):
        t = self.tok()

        if t['category'] == 'IDENTIFICADOR':
            self.pos += 1
            try:
                sym = self.st.buscar(t['lexeme'], t['line'])
                sym.utilizada = True
                self.gen.emitir('CRVL', sym.nivel, sym.endereco)
                return sym.tipo
            except SemanticError as e:
                self.add_semantic_error(e.message, t['line'])
                return 'int'

        elif t['category'] == 'NUMERO':
            self.pos += 1
            self.gen.emitir('CRCT', t['lexeme'])
            return 'int'

        elif t['category'] == 'BOOLEANO':
            self.pos += 1
            self.gen.emitir('CRCT', 1 if t['lexeme'] == 'true' else 0)
            return 'boolean'

        elif t['lexeme'] == '(':
            self.consume('(')
            tipo = self.expressao()
            self.consume(')')
            return tipo

        elif t['lexeme'] == 'not':
            self.pos += 1
            tipo = self.fator()
            if tipo != 'boolean':
                self.add_semantic_error(f"Linha {t['line']}: 'not' requer booleano.", t['line'])
            self.gen.emitir('NEGA')
            return 'boolean'

        else:
            raise SyntaxError(f"Linha {t['line']}: Fator invalido: '{t['lexeme']}'.")


# ------- Máquina Virtual MEPA -------
# implementa a máquina de pilha descrita nos slides de aula
# C = vetor de código, D = memória/pilha, s = topo, i = instruction pointer

class MEPAInterpreter:
    MAX_STEPS = 500000  # limite pra não travar em loop infinito
    D_SIZE = 10000      # tamanho da memória -- deve ser suficiente

    def __init__(self, codigo):
        self.C = codigo
        self.D = [0] * self.D_SIZE
        self.s = -1          # pilha começa vazia
        self.outputs = []
        self._call_stack = []   # endereços de retorno das chamadas de proc
        self._bases = [0]       # bases[nivel] = onde começa o frame desse nível

    def _abs(self, nivel, end):
        if nivel < len(self._bases):
            return self._bases[nivel] + end
        return end

    def executar(self, inputs):
        i = 0
        input_idx = 0
        steps = 0

        while i < len(self.C) and steps < self.MAX_STEPS:
            steps += 1
            parts = self.C[i].split()
            op = parts[0]

            try:
                if op == 'INPP':
                    self.s = -1
                elif op == 'PARA':
                    break
                elif op == 'NADA':
                    pass
                elif op == 'AMEM':
                    self.s += int(parts[1])
                elif op == 'DMEM':
                    self.s -= int(parts[1])
                elif op == 'CRCT':
                    self.s += 1
                    self.D[self.s] = int(parts[1])
                elif op == 'CRVL':
                    nivel, end = int(parts[1]), int(parts[2])
                    self.s += 1
                    self.D[self.s] = self.D[self._abs(nivel, end)]
                elif op == 'ARMZ':
                    nivel, end = int(parts[1]), int(parts[2])
                    self.D[self._abs(nivel, end)] = self.D[self.s]
                    self.s -= 1
                elif op == 'SOMA':
                    self.D[self.s-1] += self.D[self.s]; self.s -= 1
                elif op == 'SUBT':
                    self.D[self.s-1] -= self.D[self.s]; self.s -= 1
                elif op == 'MULT':
                    self.D[self.s-1] *= self.D[self.s]; self.s -= 1
                elif op == 'DIVI':
                    if self.D[self.s] == 0:
                        return self._erro("Divisao por zero.")
                    self.D[self.s-1] //= self.D[self.s]; self.s -= 1
                elif op == 'INVR':
                    self.D[self.s] = -self.D[self.s]
                elif op == 'CONJ':
                    self.D[self.s-1] = 1 if (self.D[self.s-1] and self.D[self.s]) else 0; self.s -= 1
                elif op == 'DISJ':
                    self.D[self.s-1] = 1 if (self.D[self.s-1] or self.D[self.s]) else 0; self.s -= 1
                elif op == 'NEGA':
                    self.D[self.s] = 0 if self.D[self.s] else 1
                elif op == 'CMIG':
                    self.D[self.s-1] = 1 if self.D[self.s-1] == self.D[self.s] else 0; self.s -= 1
                elif op == 'CMDG':
                    self.D[self.s-1] = 1 if self.D[self.s-1] != self.D[self.s] else 0; self.s -= 1
                elif op == 'CMME':
                    self.D[self.s-1] = 1 if self.D[self.s-1] <  self.D[self.s] else 0; self.s -= 1
                elif op == 'CMMA':
                    self.D[self.s-1] = 1 if self.D[self.s-1] >  self.D[self.s] else 0; self.s -= 1
                elif op == 'CMEG':
                    self.D[self.s-1] = 1 if self.D[self.s-1] <= self.D[self.s] else 0; self.s -= 1
                elif op == 'CMAG':
                    self.D[self.s-1] = 1 if self.D[self.s-1] >= self.D[self.s] else 0; self.s -= 1
                elif op == 'DSVS':
                    i = int(parts[1]); continue
                elif op == 'DSVF':
                    p = int(parts[1])
                    val = self.D[self.s]; self.s -= 1
                    if val == 0:
                        i = p; continue
                elif op == 'LEIT':
                    if input_idx >= len(inputs):
                        return self._erro("Entradas insuficientes para 'read'.")
                    self.s += 1
                    self.D[self.s] = inputs[input_idx]
                    input_idx += 1
                elif op == 'IMPR':
                    self.outputs.append(self.D[self.s])
                    self.s -= 1
                elif op == 'ENPR':
                    nivel = int(parts[1])
                    while len(self._bases) <= nivel:
                        self._bases.append(0)
                    self._bases[nivel] = self.s + 1
                elif op == 'RTPR':
                    nivel = int(parts[1])
                    if nivel < len(self._bases):
                        self.s = self._bases[nivel] - 1
                    if self._call_stack:
                        i = self._call_stack.pop()
                        continue
                elif op == 'CHPR':
                    proc_addr = int(parts[2])
                    self._call_stack.append(i + 1)
                    i = proc_addr
                    continue

                i += 1

            except (IndexError, ValueError) as e:
                return self._erro(f"Erro em tempo de execucao na instrucao {i}: {str(e)}")

        if steps >= self.MAX_STEPS:
            return self._erro("Limite de passos atingido - possivel loop infinito.")

        return {
            "outputs": self.outputs,
            "runtime_error": None,
            "D_final": list(self.D[:max(0, self.s + 1)]),
        }

    def _erro(self, msg):
        return {"outputs": self.outputs, "runtime_error": msg, "D_final": list(self.D[:max(0, self.s+1)])}


# ------- Endpoints da API -------

@app.post("/scan")
def scan_endpoint(source: SourceCode):
    # só faz a análise léxica e monta uma tabela de símbolos básica
    # a tabela 'de verdade' (com nivel e endereço) só vem no /compile
    scanner = Scanner(source.code)
    tokens = scanner.scan()
    symbol_table_vars = {}
    for i, t in enumerate(tokens):
        if t['category'] == 'IDENTIFICADOR':
            lexeme = t['lexeme']
            if lexeme not in symbol_table_vars:
                categoria = "Variavel"
                if i > 0 and tokens[i-1]['lexeme'] == 'program':
                    categoria = "Programa"
                elif i > 0 and tokens[i-1]['lexeme'] == 'procedure':
                    categoria = "Procedimento"
                symbol_table_vars[lexeme] = {
                    "id": len(symbol_table_vars) + 1,
                    "nome": lexeme,
                    "tipo": "int" if categoria == "Variavel" else "-",
                    "categoria": categoria,
                    "valor": "-",
                    "usada": False,
                }
            else:
                if symbol_table_vars[lexeme]['categoria'] != "Programa":
                    symbol_table_vars[lexeme]["usada"] = True
            if i + 2 < len(tokens) and tokens[i+1]['lexeme'] == ':=' and tokens[i+2]['category'] in ['NUMERO', 'BOOLEANO', 'IDENTIFICADOR']:
                symbol_table_vars[lexeme]["valor"] = tokens[i+2]['lexeme']
    return {"tokens": tokens, "symbol_table": list(symbol_table_vars.values())}


@app.post("/parse-step")
def parse_step_endpoint(source: SourceCode):
    # análise passo a passo usando a tabela LL(1) -- serve pra visualização
    scanner = Scanner(source.code)
    tokens = scanner.scan()
    lex_errors = [t for t in tokens if t['category'] == 'ERRO_LEXICO']
    if lex_errors:
        return {"passos": [], "sucesso": False, "erro_sintatico": "Erro lexico encontrado."}
    parser = TabelarParser(tokens)
    return parser.parse()


@app.post("/compile")
def compile_endpoint(source: SourceCode):
    # compilação completa: léxico -> sintático -> semântico -> geração MEPA
    scanner = Scanner(source.code)
    tokens = scanner.scan()
    lex_errors = [t for t in tokens if t['category'] == 'ERRO_LEXICO']
    if lex_errors:
        erros = [{"tipo": "lexico", "mensagem": t.get('error', 'Erro lexico'), "linha": t['line']} for t in lex_errors]
        return {"sucesso": False, "erros": erros, "mepa_code": [], "symbol_table": []}
    parser = RecursiveParser(tokens)
    return parser.parse()


@app.post("/execute")
def execute_endpoint(req: ExecuteRequest):
    # roda o código MEPA gerado na VM e devolve as saídas
    interp = MEPAInterpreter(req.mepa_code)
    return interp.executar(req.inputs)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
