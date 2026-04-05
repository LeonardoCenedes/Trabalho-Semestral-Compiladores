from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class SourceCode(BaseModel):
    code: str

class Token(BaseModel):
    line: int
    lexeme: str
    category: str
    error: Optional[str] = None

class SymbolTableEntry(BaseModel):
    id: int
    nome: str
    tipo: str
    categoria: str
    valor: str
    usada: bool

class ScanResult(BaseModel):
    tokens: List[Token]
    symbol_table: List[SymbolTableEntry]

KEYWORDS = {
    'program', 'procedure', 'var', 'begin', 'end', 'if', 'then', 'else', 
    'while', 'do'
}
TYPES = {'int', 'boolean'}
BOOL_CONSTS = {'true', 'false'}
NATIVE_PROCS = {'read', 'write'}
LOGICAL_OPS = {'and', 'or', 'not'}
ARITH_OPS = {'div'} 

class Scanner:
    def __init__(self, source_code: str):
        self.source = source_code
        self.current_pos = 0
        self.line = 1
        self.tokens = []

    def peek(self) -> str:
        """Returns the current character without advancing, or None if EOF."""
        if self.current_pos < len(self.source):
            return self.source[self.current_pos]
        return None

    def next_char(self) -> str:
        """Returns the current character and advances the position."""
        if self.current_pos < len(self.source):
            char = self.source[self.current_pos]
            self.current_pos += 1
            if char == '\n':
                self.line += 1
            return char
        return None

    def advance(self):
        """Advances the position without returning."""
        self.next_char()

    def add_token(self, lexeme: str, category: str, line: int, error: str = None):
        self.tokens.append({
            "line": line,
            "lexeme": lexeme,
            "category": category,
            "error": error
        })

    def scan(self) -> List[dict]:
        while self.peek() is not None:
            char = self.peek()

            
            if char.isspace():
                self.advance()
                continue

            
            if char == '{':
                self.advance()
                while self.peek() is not None and self.peek() != '}':
                    self.advance()
                if self.peek() == '}':
                    self.advance()
                else:
                    self.add_token("{", "ERRO_LEXICO", self.line, "Comentário não fechado")
                continue
            
            if char == '/':
                self.advance()
                if self.peek() == '/':
                    
                    while self.peek() is not None and self.peek() != '\n':
                        self.advance()
                else:
                    self.add_token("/", "ERRO_LEXICO", self.line, "Caractere inesperado")
                continue

            
            if char.isalpha() or char == '_':
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
                elif lexeme in NATIVE_PROCS:
                    self.add_token(lexeme, "PROCEDIMENTO", start_line)
                elif lexeme in LOGICAL_OPS:
                    self.add_token(lexeme, "OPERADOR_LOGICO", start_line)
                elif lexeme in ARITH_OPS:
                    self.add_token(lexeme, "OPERADOR_ARITMETICO", start_line)
                else:
                    self.add_token(lexeme, "IDENTIFICADOR", start_line)
                continue

            
            if char.isdigit():
                start_line = self.line
                lexeme = ""
                while self.peek() is not None and self.peek().isdigit():
                    lexeme += self.next_char()
                self.add_token(lexeme, "NUMERO", start_line)
                continue

            
            
            if char == ':':
                start_line = self.line
                self.advance()
                if self.peek() == '=':
                    self.advance()
                    self.add_token(":=", "ATRIBUICAO", start_line)
                else:
                    self.add_token(":", "DELIMITADOR", start_line)
                continue

            if char == '<':
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

            if char == '>':
                start_line = self.line
                self.advance()
                if self.peek() == '=':
                    self.advance()
                    self.add_token(">=", "OPERADOR_RELACIONAL", start_line)
                else:
                    self.add_token(">", "OPERADOR_RELACIONAL", start_line)
                continue

            
            if char in {'+', '-', '*'}:
                self.add_token(self.next_char(), "OPERADOR_ARITMETICO", self.line)
                continue
            
            if char == '=':
                self.add_token(self.next_char(), "OPERADOR_RELACIONAL", self.line)
                continue

            if char in {'.', ';', ',', '(', ')', '[', ']'}:
                self.add_token(self.next_char(), "DELIMITADOR", self.line)
                continue
            
            
            invalid_char = self.next_char()
            self.add_token(invalid_char, "ERRO_LEXICO", self.line, f"Caractere '{invalid_char}' não reconhecido")

        return self.tokens

TERMINAL_MAP = {
    "program": "program",
    ";": ";",
    ".": ".",
    "begin": "begin",
    "end": "end",
    "var": "var",
    ":": ":",
    ":=": ":=",
    "(": "(",
    ")": ")",
    "read": "read",
    "write": "write",
    "IDENTIFICADOR": "id",
    "NUMERO": "num",
    "TIPO": "tipo",
}

LL1_TABLE = {
    "<programa>": {"program": ["program", "id", ";", "<bloco>", "."]},
    "<bloco>": {
        "var": ["<parte_declaracoes_vars>", "<comando_composto>"],
        "begin": ["<comando_composto>"]
    },
    "<parte_declaracoes_vars>": {
        "var": ["var", "id", ":", "tipo", ";", "<mais_declaracoes>"]
    },
    "<mais_declaracoes>": {
        "id": ["id", ":", "tipo", ";", "<mais_declaracoes>"],
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
        "id": ["id", ":=", "<expressao>"],
        "read": ["read", "(", "id", ")"],
        "write": ["write", "(", "<expressao>", ")"]
    },
    "<expressao>": {
        "num": ["num"],
        "id": ["id"]
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

class Parser:
    def __init__(self, tokens: List[dict]):
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
            current_symbol = self.input_stream[index]

            step_info = {
                "pilha": self.stack.copy(),
                "entrada": self.input_stream[index:],
                "acao": "",
                "status": "processando"
            }

            if top == "$" and current_symbol == "$":
                step_info["acao"] = "Análise concluída com sucesso."
                step_info["status"] = "sucesso"
                self.stack.pop()
                self.steps.append(step_info)
                break
            elif top == current_symbol:
                step_info["acao"] = f"Match: {top}"
                step_info["status"] = "match"
                self.stack.pop()
                index += 1
            elif top in LL1_TABLE:
                if current_symbol in LL1_TABLE[top]:
                    production = LL1_TABLE[top][current_symbol]
                    step_info["acao"] = f"Expandir {top} -> {' '.join(production) if production else 'ε'}"
                    self.stack.pop()
                    if production:
                        for prod_sym in reversed(production):
                            self.stack.append(prod_sym)
                else:
                    self.success = False
                    self.error_msg = f"Erro Sintático: Token '{current_symbol}' inesperado. Não há transição para M[{top}, {current_symbol}]."
                    step_info["acao"] = self.error_msg
                    step_info["status"] = "erro"
                    self.steps.append(step_info)
                    break
            else:
                self.success = False
                self.error_msg = f"Erro Sintático: Token '{current_symbol}' não esperado. Esperava-se '{top}'."
                step_info["acao"] = self.error_msg
                step_info["status"] = "erro"
                self.steps.append(step_info)
                break

            self.steps.append(step_info)
        
        return {
            "passos": self.steps,
            "sucesso": self.success,
            "erro_sintatico": self.error_msg
        }

@app.post("/scan", response_model=ScanResult)
def scan_code(source: SourceCode):
    scanner = Scanner(source.code)
    try:
        tokens = scanner.scan()
        

        symbol_table_vars = {}
        for i, t in enumerate(tokens):
            if t['category'] == 'IDENTIFICADOR':
                lexeme = t['lexeme']
                if lexeme not in symbol_table_vars:
                    categoria = "Variável"
                    if i > 0 and tokens[i-1]['lexeme'] == 'program':
                        categoria = "Programa"
                    elif i > 0 and tokens[i-1]['lexeme'] == 'procedure':
                        categoria = "Procedimento"

                    entry = {
                        "id": len(symbol_table_vars) + 1,
                        "nome": lexeme,
                        "tipo": "Inteiro" if categoria == "Variável" else "-",
                        "categoria": categoria,
                        "valor": "-",
                        "usada": False
                    }
                    symbol_table_vars[lexeme] = entry
                else:
                    if symbol_table_vars[lexeme]['categoria'] != "Programa":
                        symbol_table_vars[lexeme]["usada"] = True

                if i + 2 < len(tokens) and tokens[i+1]['lexeme'] == ':=' and tokens[i+2]['category'] in ['NUMERO', 'BOOLEANO', 'IDENTIFICADOR']:
                    symbol_table_vars[lexeme]["valor"] = tokens[i+2]['lexeme']
                    
        return {"tokens": tokens, "symbol_table": list(symbol_table_vars.values())}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/parse-step")
def parse_code(source: SourceCode):
    scanner = Scanner(source.code)
    tokens = scanner.scan()
    
    lex_errors = [t for t in tokens if t['category'] == 'ERRO_LEXICO']
    if lex_errors:
        return {
            "passos": [],
            "sucesso": False,
            "erro_sintatico": "Erro léxico encontrado. Corrija o código antes da análise sintática."
        }
        
    parser = Parser(tokens)
    return parser.parse()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
