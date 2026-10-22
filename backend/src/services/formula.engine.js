/**
 * Motor de fórmulas SEGURO: tokenizador + parser recursivo propio + intérprete de AST.
 * No usa eval/Function/vm. Sólo opera sobre una lista blanca de funciones y variables.
 *
 * Gramática:  expr := or ;  or := and ('||' and)* ;  and := eq ('&&' eq)* ;
 *             eq := cmp (('=='|'!=') cmp)* ;  cmp := add (('<'|'<='|'>'|'>=') add)*
 *             add := mul (('+'|'-') mul)* ;  mul := un (('*'|'/'|'%') un)*
 *             un := ('-'|'!') un | prim ;  prim := num | str | true | false | id | id '(' args ')' | '(' expr ')'
 *
 * Agregadas (recorren las encuestas; su argumento se evalúa POR FILA):
 *   SUM(e) AVG(e) MIN(e) MAX(e) COUNT([cond])
 * Escalares:  IF(c,a,b)  ROUND(x[,d])  ABS(x)  FLOOR(x)  CEIL(x)  DIV(a,b)  PCT(a,b)
 * Ejemplos:   SUM(personas)
 *             PCT(COUNT(nivel_agua > 50), COUNT())
 *             SUM(IF(perdio_documentacion, personas, 0))
 */
class FormulaError extends Error {}

const MAX_LEN = 500, MAX_NODOS = 200, MAX_PASOS = 5_000_000;
const AGREGADAS = new Set(['SUM', 'AVG', 'MIN', 'MAX', 'COUNT']);
const ESCALARES = new Set(['IF', 'ROUND', 'ABS', 'FLOOR', 'CEIL', 'DIV', 'PCT']);

function tokenizar(src) {
  if (typeof src !== 'string' || !src.trim()) throw new FormulaError('La fórmula está vacía');
  if (src.length > MAX_LEN) throw new FormulaError(`La fórmula supera ${MAX_LEN} caracteres`);
  const re = /\s*(?:(\d+(?:\.\d+)?)|([A-Za-z_][A-Za-z0-9_]*)|"([^"]*)"|'([^']*)'|(&&|\|\||==|!=|<=|>=|[-+*/%<>!(),]))/y;
  const out = [];
  let pos = 0;
  while (pos < src.length) {
    if (/^\s*$/.test(src.slice(pos))) break;
    re.lastIndex = pos;
    const m = re.exec(src);
    if (!m) throw new FormulaError(`Carácter no permitido en la posición ${pos + 1}`);
    if (m[1] !== undefined) out.push({ t: 'num', v: parseFloat(m[1]) });
    else if (m[2] !== undefined) out.push({ t: 'id', v: m[2] });
    else if (m[3] !== undefined || m[4] !== undefined) out.push({ t: 'str', v: m[3] ?? m[4] });
    else out.push({ t: 'op', v: m[5] });
    pos = re.lastIndex;
  }
  return out;
}

function parsear(tokens) {
  let i = 0, nodos = 0;
  const peek = () => tokens[i];
  const esOp = (v) => peek()?.t === 'op' && peek().v === v;
  const nodo = (n) => { if (++nodos > MAX_NODOS) throw new FormulaError('La fórmula es demasiado compleja'); return n; };
  const esperar = (v) => { if (!esOp(v)) throw new FormulaError(`Se esperaba "${v}"`); i++; };
  const NIVELES = [['||'], ['&&'], ['==', '!='], ['<', '<=', '>', '>='], ['+', '-'], ['*', '/', '%']];

  function nivel(l) {
    if (l === NIVELES.length) return unario();
    let izq = nivel(l + 1);
    while (peek()?.t === 'op' && NIVELES[l].includes(peek().v)) {
      const op = tokens[i++].v;
      izq = nodo({ k: 'bin', op, a: izq, b: nivel(l + 1) });
    }
    return izq;
  }
  function unario() {
    if (esOp('-') || esOp('!')) { const op = tokens[i++].v; return nodo({ k: 'un', op, a: unario() }); }
    return primario();
  }
  function primario() {
    const t = tokens[i++];
    if (!t) throw new FormulaError('La fórmula termina inesperadamente');
    if (t.t === 'num') return nodo({ k: 'num', v: t.v });
    if (t.t === 'str') return nodo({ k: 'str', v: t.v });
    if (t.t === 'id') {
      if (esOp('(')) {
        i++;
        const nombre = t.v.toUpperCase();
        if (!AGREGADAS.has(nombre) && !ESCALARES.has(nombre)) throw new FormulaError(`Función no permitida: ${t.v}`);
        const args = [];
        if (!esOp(')')) { do { args.push(nivel(0)); } while (esOp(',') && ++i); }
        esperar(')');
        return nodo({ k: 'fn', nombre, args });
      }
      if (t.v === 'true' || t.v === 'false') return nodo({ k: 'num', v: t.v === 'true' ? 1 : 0 });
      return nodo({ k: 'var', nombre: t.v });
    }
    if (t.v === '(') { const e = nivel(0); esperar(')'); return e; }
    throw new FormulaError(`Símbolo inesperado "${t.v}"`);
  }
  const ast = nivel(0);
  if (i < tokens.length) throw new FormulaError(`Símbolo inesperado "${tokens[i].v}"`);
  return ast;
}

function recolectarVariables(ast, set = new Set()) {
  if (ast.k === 'var') set.add(ast.nombre);
  for (const h of [ast.a, ast.b]) if (h) recolectarVariables(h, set);
  (ast.args || []).forEach((x) => recolectarVariables(x, set));
  return set;
}

/** Compila y valida. `variablesPermitidas` (Set|null) limita a las claves reales del formulario. */
function compilar(formula, variablesPermitidas = null) {
  const ast = parsear(tokenizar(formula));
  const variables = recolectarVariables(ast);
  if (variablesPermitidas) {
    for (const v of variables) if (!variablesPermitidas.has(v)) throw new FormulaError(`Variable desconocida: ${v}`);
  }
  return { ast, variables: [...variables] };
}

const num = (v) => (typeof v === 'boolean' ? (v ? 1 : 0) : typeof v === 'number' ? v : Number.isFinite(parseFloat(v)) ? parseFloat(v) : 0);
const norm = (v) => (typeof v === 'boolean' ? (v ? 1 : 0) : v);

function ev(n, ctx) {
  if (++ctx.pasos > MAX_PASOS) throw new FormulaError('La fórmula excede el presupuesto de cálculo');
  switch (n.k) {
    case 'num': case 'str': return n.v;
    case 'var':
      if (!ctx.fila) throw new FormulaError(`"${n.nombre}" debe usarse dentro de SUM(), AVG(), MIN(), MAX() o COUNT()`);
      return Object.hasOwn(ctx.fila, n.nombre) ? (ctx.fila[n.nombre] ?? 0) : 0; // hasOwn: bloquea __proto__/constructor
    case 'un': { const a = ev(n.a, ctx); return n.op === '-' ? -num(a) : num(a) ? 0 : 1; }
    case 'bin': {
      if (n.op === '&&') return num(ev(n.a, ctx)) && num(ev(n.b, ctx)) ? 1 : 0;
      if (n.op === '||') return num(ev(n.a, ctx)) || num(ev(n.b, ctx)) ? 1 : 0;
      const a = ev(n.a, ctx), b = ev(n.b, ctx);
      switch (n.op) {
        case '==': return norm(a) === norm(b) ? 1 : 0;
        case '!=': return norm(a) !== norm(b) ? 1 : 0;
        case '<': return num(a) < num(b) ? 1 : 0;
        case '<=': return num(a) <= num(b) ? 1 : 0;
        case '>': return num(a) > num(b) ? 1 : 0;
        case '>=': return num(a) >= num(b) ? 1 : 0;
        case '+': return num(a) + num(b);
        case '-': return num(a) - num(b);
        case '*': return num(a) * num(b);
        case '/': if (num(b) === 0) throw new FormulaError('División por cero (usar DIV o PCT)'); return num(a) / num(b);
        case '%': if (num(b) === 0) throw new FormulaError('Módulo por cero'); return num(a) % num(b);
      }
      throw new FormulaError('Operador inválido');
    }
    case 'fn': return llamar(n, ctx);
  }
  throw new FormulaError('Nodo inválido');
}

function llamar(n, ctx) {
  const { nombre, args } = n;
  const aridad = (min, max = min) => { if (args.length < min || args.length > max) throw new FormulaError(`${nombre} espera ${min}${max !== min ? `–${max}` : ''} argumento(s)`); };
  if (AGREGADAS.has(nombre)) {
    if (ctx.fila) throw new FormulaError(`${nombre} no puede anidarse dentro de otra función agregada`);
    if (nombre === 'COUNT') {
      aridad(0, 1);
      if (!args.length) return ctx.filas.length;
      let c = 0;
      for (const f of ctx.filas) if (num(ev(args[0], { ...ctx, fila: f }))) c++;
      return c;
    }
    aridad(1);
    const vals = [];
    for (const f of ctx.filas) { ctx.fila = f; vals.push(num(ev(args[0], ctx))); }
    ctx.fila = null;
    if (nombre === 'SUM') return vals.reduce((s, x) => s + x, 0);
    if (!vals.length) return 0;
    if (nombre === 'AVG') return vals.reduce((s, x) => s + x, 0) / vals.length;
    return nombre === 'MIN' ? Math.min(...vals) : Math.max(...vals);
  }
  switch (nombre) {
    case 'IF': aridad(3); return num(ev(args[0], ctx)) ? ev(args[1], ctx) : ev(args[2], ctx); // evaluación perezosa
    case 'ROUND': { aridad(1, 2); const d = args[1] ? Math.min(6, Math.max(0, num(ev(args[1], ctx)))) : 0; const k = 10 ** d; return Math.round(num(ev(args[0], ctx)) * k) / k; }
    case 'ABS': aridad(1); return Math.abs(num(ev(args[0], ctx)));
    case 'FLOOR': aridad(1); return Math.floor(num(ev(args[0], ctx)));
    case 'CEIL': aridad(1); return Math.ceil(num(ev(args[0], ctx)));
    case 'DIV': { aridad(2); const b = num(ev(args[1], ctx)); return b === 0 ? 0 : num(ev(args[0], ctx)) / b; }
    case 'PCT': { aridad(2); const b = num(ev(args[1], ctx)); return b === 0 ? 0 : (100 * num(ev(args[0], ctx))) / b; }
  }
  throw new FormulaError(`Función no permitida: ${nombre}`);
}

/** Evalúa una fórmula compilada sobre `filas` (array de objetos clave→valor). */
function evaluar(compilada, filas) {
  const r = ev(compilada.ast, { filas, fila: null, pasos: 0 });
  if (!Number.isFinite(r)) throw new FormulaError('El resultado no es un número finito');
  return r;
}

module.exports = { compilar, evaluar, FormulaError, FUNCIONES: [...AGREGADAS, ...ESCALARES] };
