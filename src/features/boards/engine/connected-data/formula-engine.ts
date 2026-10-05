/**
 * Formula Engine
 *
 * Metadata-driven expression engine over:
 *   - Current record fields
 *   - Mirror columns (resolved via MirrorService)
 *   - Lookup columns (resolved via LookupService)
 *   - Rollup columns (resolved via RollupService)
 *   - Static values
 *
 * ── Design Decisions ────────────────────────────────────────
 * 1. Formulas NEVER query the database directly. Everything flows
 *    through the Query Service → Resolved Values → Formula Engine.
 *    This keeps formulas deterministic and testable.
 *
 * 2. Dependency extraction happens at CONFIG TIME (when the user
 *    saves the formula), not at runtime. This enables the dependency
 *    graph to know which columns a formula depends on.
 *
 * 3. A formula recalculates only when an input it ACTUALLY depends on
 *    changes, not on every write to the record. This is enforced by
 *    the dependency graph.
 * ────────────────────────────────────────────────────────────
 */

import type { ColumnValue } from "../types";

// ── Formula Token Types ─────────────────────────────────────

export type FormulaTokenType =
  | "number"
  | "string"
  | "boolean"
  | "identifier"
  | "operator"
  | "function"
  | "left_paren"
  | "right_paren"
  | "comma"
  | "reference"; // e.g., {Status} or {Mirror:PO Status}

export interface FormulaToken {
  type: FormulaTokenType;
  value: string;
  position: number;
}

// ── AST Node Types ──────────────────────────────────────────

export type AstNode =
  | AstLiteralNode
  | AstIdentifierNode
  | AstReferenceNode
  | AstBinaryOpNode
  | AstUnaryOpNode
  | AstFunctionCallNode;

export interface AstLiteralNode {
  kind: "literal";
  value: string | number | boolean;
}

export interface AstIdentifierNode {
  kind: "identifier";
  name: string;
}

export interface AstReferenceNode {
  kind: "reference";
  columnId: string;
  /** The column key or label used in the formula */
  columnKey: string;
}

export interface AstBinaryOpNode {
  kind: "binary_op";
  operator: string;
  left: AstNode;
  right: AstNode;
}

export interface AstUnaryOpNode {
  kind: "unary_op";
  operator: string;
  operand: AstNode;
}

export interface AstFunctionCallNode {
  kind: "function_call";
  functionName: string;
  args: AstNode[];
}

// ── Formula Evaluation Context ──────────────────────────────

export interface FormulaEvalContext {
  /** The resolved values for the current record */
  recordValues: Record<string, ColumnValue>;

  /** Today's date string (YYYY-MM-DD) */
  today: string;

  /** Current timestamp ISO string */
  now: string;
}

// ── Formula Engine ──────────────────────────────────────────

export const FormulaEngine = {
  /**
   * Evaluate a formula expression against a record context.
   *
   * @param expression - The formula string (e.g., "{Status} + ' - ' + {Due Date}")
   * @param context - The evaluation context with resolved values
   * @returns The computed value
   */
  evaluate(
    expression: string,
    context: FormulaEvalContext,
  ): ColumnValue {
    try {
      const tokens = this.tokenize(expression);
      const ast = this.parse(tokens);
      return this.execute(ast, context);
    } catch (error) {
      return `#ERROR: ${(error as Error).message}`;
    }
  },

  /**
   * Extract dependency column IDs from a formula expression.
   * Called at config time to populate the dependency graph.
   */
  extractDependencies(expression: string): string[] {
    const depRegex = /\{([^}]+)\}/g;
    const deps: string[] = [];
    let match;

    while ((match = depRegex.exec(expression)) !== null) {
      deps.push(match[1].trim());
    }

    return deps;
  },

  // ── Tokenizer ──────────────────────────────────────────

  tokenize(expression: string): FormulaToken[] {
    const tokens: FormulaToken[] = [];
    let i = 0;

    while (i < expression.length) {
      // Skip whitespace
      if (/\s/.test(expression[i])) {
        i++;
        continue;
      }

      // Reference: {Column Name}
      if (expression[i] === "{") {
        const start = i;
        i++;
        let ref = "";
        let depth = 1;

        while (i < expression.length && depth > 0) {
          if (expression[i] === "{") depth++;
          if (expression[i] === "}") depth--;
          if (depth > 0) ref += expression[i];
          i++;
        }

        tokens.push({
          type: "reference",
          value: ref.trim(),
          position: start,
        });
        continue;
      }

      // String literal
      if (expression[i] === "'" || expression[i] === '"') {
        const quote = expression[i];
        const start = i;
        i++;
        let str = "";

        while (i < expression.length && expression[i] !== quote) {
          str += expression[i];
          i++;
        }

        if (i < expression.length) i++; // skip closing quote

        tokens.push({
          type: "string",
          value: str,
          position: start,
        });
        continue;
      }

      // Number literal
      if (/[0-9.]/.test(expression[i])) {
        const start = i;
        let num = "";

        while (i < expression.length && /[0-9.]/.test(expression[i])) {
          num += expression[i];
          i++;
        }

        tokens.push({
          type: "number",
          value: num,
          position: start,
        });
        continue;
      }

      // Identifiers and function names
      if (/[a-zA-Z_]/.test(expression[i])) {
        const start = i;
        let word = "";

        while (i < expression.length && /[a-zA-Z0-9_]/.test(expression[i])) {
          word += expression[i];
          i++;
        }

        const upper = word.toUpperCase();
        const isFunction = this.isFunctionName(upper);
        tokens.push({
          type: isFunction ? "function" : "identifier",
          value: isFunction ? upper : word,
          position: start,
        });
        continue;
      }

      // Multi-character operators
      if (expression[i] === "=" && expression[i + 1] === "=") {
        tokens.push({ type: "operator", value: "==", position: i });
        i += 2;
        continue;
      }

      if (expression[i] === "!" && expression[i + 1] === "=") {
        tokens.push({ type: "operator", value: "!=", position: i });
        i += 2;
        continue;
      }

      if (expression[i] === "&" && expression[i + 1] === "&") {
        tokens.push({ type: "operator", value: "AND", position: i });
        i += 2;
        continue;
      }

      if (expression[i] === "|" && expression[i + 1] === "|") {
        tokens.push({ type: "operator", value: "OR", position: i });
        i += 2;
        continue;
      }

      // Single-character operators
      const singleCharOps: Record<string, string> = {
        "+": "+",
        "-": "-",
        "*": "*",
        "/": "/",
        "%": "%",
        "(": "(",
        ")": ")",
        ",": ",",
        "<": "<",
        ">": ">",
        "=": "=",
      };

      if (singleCharOps[expression[i]]) {
        const char = expression[i];
        let type: FormulaTokenType = "operator";

        if (char === "(") type = "left_paren";
        else if (char === ")") type = "right_paren";
        else if (char === ",") type = "comma";

        tokens.push({ type, value: char, position: i });
        i++;
        continue;
      }

      // Unknown character — skip
      i++;
    }

    return tokens;
  },

  // ── Parser (Recursive Descent) ────────────────────────

  parse(tokens: FormulaToken[]): AstNode {
    let pos = 0;

    const peek = (): FormulaToken | undefined => tokens[pos];
    const consume = (): FormulaToken => tokens[pos++];
    const expect = (type: FormulaTokenType, value?: string): FormulaToken => {
      const token = peek();
      if (!token || token.type !== type || (value && token.value !== value)) {
        throw new Error(
          `Expected ${value ? `${type}(${value})` : type} at position ${pos}, got ${token?.type}(${token?.value})`,
        );
      }
      return consume();
    };

    // Parse the top-level expression (comma-separated = CONCAT)
    const parseExpression = (): AstNode => {
      const left = parseLogicalOr();

      if (peek()?.type === "comma") {
        // Comma-separated expressions are treated as CONCAT
        const args: AstNode[] = [left];
        while (peek()?.type === "comma") {
          consume(); // skip comma
          args.push(parseLogicalOr());
        }
        return {
          kind: "function_call",
          functionName: "CONCAT",
          args,
        } as AstFunctionCallNode;
      }

      return left;
    };

    const parseLogicalOr = (): AstNode => {
      let left = parseLogicalAnd();

      while (peek()?.type === "operator" && peek()!.value === "OR") {
        const op = consume().value;
        const right = parseLogicalAnd();
        left = {
          kind: "binary_op",
          operator: op,
          left,
          right,
        } as AstBinaryOpNode;
      }

      return left;
    };

    const parseLogicalAnd = (): AstNode => {
      let left = parseEquality();

      while (peek()?.type === "operator" && peek()!.value === "AND") {
        const op = consume().value;
        const right = parseEquality();
        left = {
          kind: "binary_op",
          operator: op,
          left,
          right,
        } as AstBinaryOpNode;
      }

      return left;
    };

    const parseEquality = (): AstNode => {
      let left = parseComparison();

      while (
        peek()?.type === "operator" &&
        (peek()!.value === "==" || peek()!.value === "!=")
      ) {
        const op = consume().value;
        const right = parseComparison();
        left = {
          kind: "binary_op",
          operator: op,
          left,
          right,
        } as AstBinaryOpNode;
      }

      return left;
    };

    const parseComparison = (): AstNode => {
      let left = parseAdditive();

      while (
        peek()?.type === "operator" &&
        ["<", ">", "<=", ">="].includes(peek()!.value)
      ) {
        const op = consume().value;
        const right = parseAdditive();
        left = {
          kind: "binary_op",
          operator: op,
          left,
          right,
        } as AstBinaryOpNode;
      }

      return left;
    };

    const parseAdditive = (): AstNode => {
      let left = parseMultiplicative();

      while (
        peek()?.type === "operator" &&
        (peek()!.value === "+" || (peek()!.value === "-" && !this.isUnaryMinus(tokens, pos)))
      ) {
        const op = consume().value;
        const right = parseMultiplicative();
        left = {
          kind: "binary_op",
          operator: op,
          left,
          right,
        } as AstBinaryOpNode;
      }

      return left;
    };

    const parseMultiplicative = (): AstNode => {
      let left = parseUnary();

      while (
        peek()?.type === "operator" &&
        ["*", "/", "%"].includes(peek()!.value)
      ) {
        const op = consume().value;
        const right = parseUnary();
        left = {
          kind: "binary_op",
          operator: op,
          left,
          right,
        } as AstBinaryOpNode;
      }

      return left;
    };

    const parseUnary = (): AstNode => {
      if (peek()?.type === "operator" && peek()!.value === "-") {
        const op = consume().value;
        const operand = parseUnary();
        return {
          kind: "unary_op",
          operator: op,
          operand,
        } as AstUnaryOpNode;
      }

      if (peek()?.type === "operator" && peek()!.value === "!") {
        consume(); // skip !
        const operand = parseUnary();
        return {
          kind: "unary_op",
          operator: "NOT",
          operand,
        } as AstUnaryOpNode;
      }

      return parsePrimary();
    };

    const parsePrimary = (): AstNode => {
      const token = peek();

      if (!token) {
        throw new Error("Unexpected end of expression");
      }

      // Parenthesized expression
      if (token.type === "left_paren") {
        consume(); // skip (
        const expr = parseExpression();
        expect("right_paren");
        return expr;
      }

      // Number literal
      if (token.type === "number") {
        consume();
        return {
          kind: "literal",
          value: token.value.includes(".") ? parseFloat(token.value) : parseInt(token.value, 10),
        } as AstLiteralNode;
      }

      // String literal
      if (token.type === "string") {
        consume();
        return {
          kind: "literal",
          value: token.value,
        } as AstLiteralNode;
      }

      // Reference: {Column Name}
      if (token.type === "reference") {
        consume();
        return {
          kind: "reference",
          columnKey: token.value,
          columnId: token.value,
        } as AstReferenceNode;
      }

      // Function call: IF(cond, t, f) or CONCAT(a, b)
      if (token.type === "function") {
        const funcName = consume().value;
        expect("left_paren");
        const args: AstNode[] = [];

        if (peek()?.type !== "right_paren") {
          args.push(parseExpression());
          while (peek()?.type === "comma") {
            consume();
            args.push(parseExpression());
          }
        }

        expect("right_paren");

        return {
          kind: "function_call",
          functionName: funcName,
          args,
        } as AstFunctionCallNode;
      }

      // Boolean/identifier
      if (token.type === "identifier") {
        consume();
        const upper = token.value.toUpperCase();
        if (upper === "TRUE" || upper === "FALSE") {
          return {
            kind: "literal",
            value: upper === "TRUE",
          } as AstLiteralNode;
        }
        return {
          kind: "identifier",
          name: token.value,
        } as AstIdentifierNode;
      }

      throw new Error(`Unexpected token: ${token.type}(${token.value}) at position ${token.position}`);
    };

    return parseExpression();
  },

  // ── Executor ───────────────────────────────────────────

  execute(node: AstNode, context: FormulaEvalContext): ColumnValue {
    switch (node.kind) {
      case "literal":
        return node.value;

      case "identifier": {
        const value = context.recordValues[node.name];
        return value ?? null;
      }

      case "reference": {
        // First try direct column key match
        const value = context.recordValues[node.columnKey];
        if (value !== undefined) return value;

        // Then try column ID match (referenced by ID)
        const valueById = context.recordValues[node.columnId];
        if (valueById !== undefined) return valueById;

        return null;
      }

      case "binary_op": {
        const left = this.execute(node.left, context);
        const right = this.execute(node.right, context);
        return this.applyBinaryOp(node.operator, left, right);
      }

      case "unary_op": {
        const operand = this.execute(node.operand, context);
        return this.applyUnaryOp(node.operator, operand);
      }

      case "function_call":
        return this.applyFunction(node.functionName, node.args, context);

      default:
        return null;
    }
  },

  // ── Operator Application ──────────────────────────────

  applyBinaryOp(op: string, left: ColumnValue, right: ColumnValue): ColumnValue {
    const l = left as (string | number | boolean | null);
    const r = right as (string | number | boolean | null);

    switch (op) {
      case "+":
        if (typeof l === "number" && typeof r === "number") return l + r;
        if (typeof l === "string" || typeof r === "string") return String(l ?? "") + String(r ?? "");
        return Number(l ?? 0) + Number(r ?? 0);

      case "-":
        return Number(l ?? 0) - Number(r ?? 0);

      case "*":
        return Number(l ?? 0) * Number(r ?? 0);

      case "/":
        if (Number(r ?? 0) === 0) throw new Error("Division by zero");
        return Number(l ?? 0) / Number(r ?? 0);

      case "%":
        if (Number(r ?? 0) === 0) throw new Error("Modulo by zero");
        return Number(l ?? 0) % Number(r ?? 0);

      case "==":
        return l === r;
      case "!=":
        return l !== r;
      case "<":
        return (l as number) < (r as number);
      case ">":
        return (l as number) > (r as number);
      case "<=":
        return (l as number) <= (r as number);
      case ">=":
        return (l as number) >= (r as number);

      case "AND":
        return Boolean(l) && Boolean(r);
      case "OR":
        return Boolean(l) || Boolean(r);

      default:
        throw new Error(`Unknown operator: ${op}`);
    }
  },

  applyUnaryOp(op: string, operand: ColumnValue): ColumnValue {
    switch (op) {
      case "-":
        return -Number(operand ?? 0);
      case "NOT":
        return !Boolean(operand);
      default:
        throw new Error(`Unknown unary operator: ${op}`);
    }
  },

  // ── Function Application ──────────────────────────────

  applyFunction(
    name: string,
    args: AstNode[],
    context: FormulaEvalContext,
  ): ColumnValue {
    const resolvedArgs = args.map((arg) => this.execute(arg, context));

    switch (name) {
      case "IF": {
        const [condition, trueVal, falseVal] = resolvedArgs;
        return Boolean(condition) ? trueVal : (falseVal ?? null);
      }

      case "AND":
        return resolvedArgs.every((a) => Boolean(a));

      case "OR":
        return resolvedArgs.some((a) => Boolean(a));

      case "NOT":
        return !Boolean(resolvedArgs[0]);

      case "CONCAT":
        return resolvedArgs.map((a) => String(a ?? "")).join("");

      case "ROUND": {
        const [num, decimals] = resolvedArgs;
        const d = typeof decimals === "number" ? decimals : 0;
        return typeof num === "number"
          ? Number(num.toFixed(d))
          : Number(Number(num ?? 0).toFixed(d));
      }

      case "CEIL":
        return Math.ceil(Number(resolvedArgs[0] ?? 0));

      case "FLOOR":
        return Math.floor(Number(resolvedArgs[0] ?? 0));

      case "TODAY":
        return context.today;

      case "NOW":
        return context.now;

      case "DATE_DIFF": {
        const [date1, date2, unit] = resolvedArgs;
        const d1 = new Date(String(date1 ?? ""));
        const d2 = new Date(String(date2 ?? ""));
        const diffMs = d1.getTime() - d2.getTime();

        switch (String(unit ?? "").toLowerCase()) {
          case "days":
          case "day":
            return Math.round(diffMs / (1000 * 60 * 60 * 24));
          case "hours":
          case "hour":
            return Math.round(diffMs / (1000 * 60 * 60));
          case "minutes":
          case "minute":
            return Math.round(diffMs / (1000 * 60));
          case "months":
          case "month":
            return (d1.getFullYear() - d2.getFullYear()) * 12 +
              (d1.getMonth() - d2.getMonth());
          case "years":
          case "year":
            return d1.getFullYear() - d2.getFullYear();
          default:
            return Math.round(diffMs / (1000 * 60 * 60 * 24));
        }
      }

      case "TEXT":
        return String(resolvedArgs[0] ?? "");

      case "NUMBER":
        return Number(resolvedArgs[0] ?? 0);

      case "BOOLEAN":
        return Boolean(resolvedArgs[0]);

      default:
        throw new Error(`Unknown function: ${name}`);
    }
  },

  // ── Helpers ──────────────────────────────────────────────

  isFunctionName(name: string): boolean {
    const functions = [
      "IF", "AND", "OR", "NOT", "CONCAT",
      "ROUND", "CEIL", "FLOOR",
      "TODAY", "NOW", "DATE_DIFF",
      "TEXT", "NUMBER", "BOOLEAN",
    ];
    return functions.includes(name);
  },

  isUnaryMinus(tokens: FormulaToken[], currentPos: number): boolean {
    const prev = tokens[currentPos - 1];
    if (!prev) return true;
    return (
      prev.type === "operator" ||
      prev.type === "left_paren" ||
      prev.type === "comma"
    );
  },
};

