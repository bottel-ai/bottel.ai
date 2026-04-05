import React from "react";
import { Box, Text } from "ink";
import type { ServiceAdapter } from "./types.js";

// Recursive descent parser for math expressions
// Supports: +, -, *, /, parentheses, negative numbers
function evaluate(expr: string): number {
  let pos = 0;
  const str = expr.replace(/\s+/g, "");

  function parseExpression(): number {
    let result = parseTerm();
    while (pos < str.length && (str[pos] === "+" || str[pos] === "-")) {
      const op = str[pos]!;
      pos++;
      const right = parseTerm();
      result = op === "+" ? result + right : result - right;
    }
    return result;
  }

  function parseTerm(): number {
    let result = parseFactor();
    while (pos < str.length && (str[pos] === "*" || str[pos] === "/")) {
      const op = str[pos]!;
      pos++;
      const right = parseFactor();
      if (op === "/" && right === 0) throw new Error("Division by zero");
      result = op === "*" ? result * right : result / right;
    }
    return result;
  }

  function parseFactor(): number {
    if (str[pos] === "-") {
      pos++;
      return -parseFactor();
    }
    if (str[pos] === "(") {
      pos++; // skip '('
      const result = parseExpression();
      if (str[pos] !== ")") throw new Error("Missing closing parenthesis");
      pos++; // skip ')'
      return result;
    }
    // parse number
    const start = pos;
    while (pos < str.length && (str[pos]! >= "0" && str[pos]! <= "9" || str[pos] === ".")) {
      pos++;
    }
    if (start === pos) throw new Error(`Unexpected character: ${str[pos] ?? "end of input"}`);
    return parseFloat(str.slice(start, pos));
  }

  const result = parseExpression();
  if (pos < str.length) throw new Error(`Unexpected character: ${str[pos]}`);
  return result;
}

export const calculator: ServiceAdapter = {
  id: "calculator",
  name: "Calculator",
  description: "Evaluate math expressions",
  icon: "++",
  render: (query: string) => {
    if (!query.trim()) {
      return (
        <Box>
          <Text dimColor>Type a math expression (e.g., 2 + 3 * 4)</Text>
        </Box>
      );
    }

    let result: string;
    let isError = false;
    try {
      const value = evaluate(query);
      result = Number.isInteger(value) ? value.toString() : value.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
    } catch (e: unknown) {
      result = e instanceof Error ? e.message : "Invalid expression";
      isError = true;
    }

    return (
      <Box flexDirection="column">
        <Text bold color="#a29bfe">Calculator</Text>
        <Text>{""}</Text>
        <Box>
          <Text dimColor>Expression: </Text>
          <Text>{query}</Text>
        </Box>
        <Box>
          <Text dimColor>Result:     </Text>
          <Text bold color={isError ? "#ff6b6b" : "#55efc4"}>{result}</Text>
        </Box>
      </Box>
    );
  },
};
