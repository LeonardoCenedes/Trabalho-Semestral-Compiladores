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

KEYWORDS = {
    'program', 'procedure', 'var', 'begin', 'end', 'if', 'then', 'else', 
    'while', 'do'
}
TYPES = {'int', 'boolean'}
BOOL_CONSTS = {'true', 'false'}
NATIVE_PROCS = {'read', 'write'}
LOGICAL_OPS = {'and', 'or', 'not'}
ARITH_OPS = {'div'} # 'div' is a word operator

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

            # Whitespace handling
            if char.isspace():
                self.advance()
                continue

            # Comments: // and { ... }
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
                    # Single line comment
                    while self.peek() is not None and self.peek() != '\n':
                        self.advance()
                else:
                    self.add_token("/", "ERRO_LEXICO", self.line, "Caractere inesperado")
                continue

            # Identifiers
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

            # Numbers
            if char.isdigit():
                start_line = self.line
                lexeme = ""
                while self.peek() is not None and self.peek().isdigit():
                    lexeme += self.next_char()
                self.add_token(lexeme, "NUMERO", start_line)
                continue

            # Operators and Special Symbols
            # Multi-character operators: :=, <>, <=, >=
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

            # Single character operators and delimiters
            if char in {'+', '-', '*'}:
                self.add_token(self.next_char(), "OPERADOR_ARITMETICO", self.line)
                continue
            
            if char == '=':
                self.add_token(self.next_char(), "OPERADOR_RELACIONAL", self.line)
                continue

            if char in {'.', ';', ',', '(', ')', '[', ']'}:
                self.add_token(self.next_char(), "DELIMITADOR", self.line)
                continue
            
            # Error handling for unrecognized characters
            invalid_char = self.next_char()
            self.add_token(invalid_char, "ERRO_LEXICO", self.line, f"Caractere '{invalid_char}' não reconhecido")

        return self.tokens

@app.post("/scan", response_model=List[Token])
def scan_code(source: SourceCode):
    scanner = Scanner(source.code)
    try:
        tokens = scanner.scan()
        return tokens
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
