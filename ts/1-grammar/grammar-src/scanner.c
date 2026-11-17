#include "tree_sitter/parser.h"
#include <stdbool.h>
#include <stdint.h>
#include <string.h>

enum TokenType {
  INCOMPLETE_INLINE_ACTION,
  EXPECTED_INLINE_ACTION,
  ERROR_RECOVERY,
};

enum Word {
  NO_WORD,
  DO_WORD,
  SET_WORD,
  LET_WORD,
  OTHER_WORD,
};

static bool is_name_start(int32_t c) {
  return (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || c == '_';
}

static bool is_name_continue(int32_t c) {
  return is_name_start(c) || (c >= '0' && c <= '9');
}

static bool is_line_break(int32_t c) {
  return c == '\n' || c == '\r';
}

static bool is_horizontal_space(int32_t c) {
  return c == ' ' || c == '\t' || c == '\f' || c == '\v';
}

static void advance(TSLexer *lexer) {
  lexer->advance(lexer, false);
}

static bool skip_comment(TSLexer *lexer, bool allow_newline, bool *crossed_line) {
  advance(lexer);
  if (lexer->lookahead == '/') {
    while (!lexer->eof(lexer) && !is_line_break(lexer->lookahead)) {
      advance(lexer);
    }
    return allow_newline;
  }
  if (lexer->lookahead != '*') {
    return false;
  }
  advance(lexer);
  while (!lexer->eof(lexer)) {
    if (!allow_newline && is_line_break(lexer->lookahead)) {
      return false;
    }
    if (crossed_line && is_line_break(lexer->lookahead)) {
      *crossed_line = true;
    }
    const bool star = lexer->lookahead == '*';
    advance(lexer);
    if (star && lexer->lookahead == '/') {
      advance(lexer);
      return true;
    }
  }
  return false;
}

static bool skip_trivia(TSLexer *lexer, bool allow_newline, bool *crossed_line) {
  for (;;) {
    const int32_t c = lexer->lookahead;
    if (is_horizontal_space(c) || (allow_newline && is_line_break(c))) {
      if (crossed_line && is_line_break(c)) {
        *crossed_line = true;
      }
      advance(lexer);
    } else if (c == '/') {
      if (!skip_comment(lexer, allow_newline, crossed_line)) {
        return false;
      }
    } else {
      return !is_line_break(c);
    }
  }
}

static enum Word read_word(TSLexer *lexer) {
  if (!is_name_start(lexer->lookahead)) {
    return NO_WORD;
  }
  char word[4] = {0};
  unsigned length = 0;
  do {
    if (length < sizeof(word) - 1) {
      word[length++] = (char)lexer->lookahead;
    } else {
      length = sizeof(word);
    }
    advance(lexer);
  } while (is_name_continue(lexer->lookahead));
  if (length == 2 && strcmp(word, "do") == 0) {
    return DO_WORD;
  }
  if (length == 3 && strcmp(word, "set") == 0) {
    return SET_WORD;
  }
  if (length == 3 && strcmp(word, "let") == 0) {
    return LET_WORD;
  }
  return OTHER_WORD;
}

static bool read_target(TSLexer *lexer, int32_t delimiter) {
  if (!skip_trivia(lexer, false, NULL)) {
    return false;
  }
  const enum Word first = read_word(lexer);
  if (first == NO_WORD) {
    if (delimiter == '(' && lexer->lookahead == '{') {
      advance(lexer);
      lexer->mark_end(lexer);
    }
    return false;
  }
  // Keep a subsequent let as a sibling if the parser cannot read it as the handler target.
  if (first != LET_WORD) {
    lexer->mark_end(lexer);
  }
  while (skip_trivia(lexer, false, NULL)) {
    if (lexer->lookahead == delimiter) {
      return true;
    }
    if (lexer->lookahead != '.') {
      return false;
    }
    advance(lexer);
    if (!skip_trivia(lexer, false, NULL) || read_word(lexer) == NO_WORD) {
      return false;
    }
    lexer->mark_end(lexer);
  }
  return false;
}

static bool starts_let_binding(TSLexer *lexer) {
  if (!skip_trivia(lexer, false, NULL) || read_word(lexer) == NO_WORD) {
    return false;
  }
  if (!skip_trivia(lexer, false, NULL)) {
    return false;
  }
  if (lexer->lookahead == '=') {
    return true;
  }
  if (lexer->lookahead != 'i') {
    return false;
  }
  advance(lexer);
  if (lexer->lookahead != 's') {
    return false;
  }
  advance(lexer);
  return !is_name_continue(lexer->lookahead);
}

static bool recover_inline_action(TSLexer *lexer) {
  lexer->mark_end(lexer);
  bool crossed_line = false;
  if (!skip_trivia(lexer, true, &crossed_line)) {
    return true;
  }
  // Braced handlers may open on a later line.
  if (lexer->lookahead == '{') {
    return false;
  }
  if (crossed_line) {
    return true;
  }
  const enum Word command = read_word(lexer);
  if (command == NO_WORD || command == LET_WORD) {
    return true;
  }
  lexer->mark_end(lexer);
  if (command == DO_WORD) {
    return !read_target(lexer, '(');
  }
  if (command != SET_WORD || !read_target(lexer, '=')) {
    return true;
  }
  advance(lexer);
  lexer->mark_end(lexer);
  if (!skip_trivia(lexer, false, NULL)) {
    return true;
  }
  if (lexer->lookahead == '"') {
    return false;
  }
  const enum Word value = read_word(lexer);
  return value == NO_WORD || (value == LET_WORD && starts_let_binding(lexer));
}

void *tree_sitter_tao_external_scanner_create(void) { return NULL; }
void tree_sitter_tao_external_scanner_destroy(void *payload) { (void)payload; }

unsigned tree_sitter_tao_external_scanner_serialize(void *payload, char *buffer) {
  (void)payload;
  (void)buffer;
  return 0;
}

void tree_sitter_tao_external_scanner_deserialize(void *payload, const char *buffer, unsigned length) {
  (void)payload;
  (void)buffer;
  (void)length;
}

bool tree_sitter_tao_external_scanner_scan(void *payload, TSLexer *lexer, const bool *valid_symbols) {
  (void)payload;
  // Tree-sitter offers every external token in its general recovery states. Keep this token local.
  if (!valid_symbols[INCOMPLETE_INLINE_ACTION] || valid_symbols[ERROR_RECOVERY]) {
    return false;
  }
  if (!recover_inline_action(lexer)) {
    return false;
  }
  lexer->result_symbol = INCOMPLETE_INLINE_ACTION;
  return true;
}
